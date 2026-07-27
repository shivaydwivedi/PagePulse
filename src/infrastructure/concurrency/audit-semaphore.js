import { AppError } from '../../utils/errors.js'

export function auditCapacityError(reason, cause) {
  return new AppError({
    code: 'AUDIT_CAPACITY_EXCEEDED',
    message: 'PagePulse is currently processing the maximum number of audits.',
    statusCode: 503,
    details: [{ reason }],
    cause
  })
}

function abortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error('Audit permit acquisition was aborted.')
}

export function createAuditSemaphore({
  maxConcurrent,
  maxQueueSize,
  queueTimeoutMs,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  let activeCount = 0
  const queue = []

  function makeRelease() {
    let released = false

    return () => {
      if (released) {
        return
      }

      released = true
      activeCount = Math.max(0, activeCount - 1)
      drainQueue()
    }
  }

  function settleWaiter(waiter, action, value) {
    if (waiter.settled) {
      return
    }

    waiter.settled = true
    clearTimer(waiter.timer)
    waiter.signal?.removeEventListener('abort', waiter.abortListener)
    action(value)
  }

  function removeWaiter(waiter) {
    const index = queue.indexOf(waiter)
    if (index >= 0) {
      queue.splice(index, 1)
    }
  }

  function grantWaiter(waiter) {
    activeCount += 1
    settleWaiter(waiter, waiter.resolve, makeRelease())
  }

  function drainQueue() {
    while (activeCount < maxConcurrent && queue.length > 0) {
      const waiter = queue.shift()

      if (!waiter.settled) {
        grantWaiter(waiter)
        return
      }
    }
  }

  async function acquire(options = {}) {
    const { signal } = options

    if (signal?.aborted) {
      throw abortError(signal)
    }

    if (activeCount < maxConcurrent) {
      activeCount += 1
      return makeRelease()
    }

    if (maxQueueSize === 0) {
      throw auditCapacityError('capacity_reached')
    }

    if (queue.length >= maxQueueSize) {
      throw auditCapacityError('queue_full')
    }

    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        settled: false,
        signal,
        abortListener: undefined,
        timer: undefined
      }

      waiter.abortListener = () => {
        removeWaiter(waiter)
        settleWaiter(waiter, reject, abortError(signal))
      }

      waiter.timer = setTimer(() => {
        removeWaiter(waiter)
        settleWaiter(waiter, reject, auditCapacityError('queue_timeout'))
      }, queueTimeoutMs)

      signal?.addEventListener('abort', waiter.abortListener, { once: true })
      queue.push(waiter)
    })
  }

  return {
    acquire,
    get activeCount() {
      return activeCount
    },
    get queueSize() {
      return queue.filter((waiter) => !waiter.settled).length
    }
  }
}
