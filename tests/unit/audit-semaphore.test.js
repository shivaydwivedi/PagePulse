import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuditSemaphore } from '../../src/infrastructure/concurrency/audit-semaphore.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('audit semaphore', () => {
  it('acquires immediately below capacity and releases idempotently', async () => {
    const semaphore = createAuditSemaphore({ maxConcurrent: 2, maxQueueSize: 1, queueTimeoutMs: 1000 })
    const releaseA = await semaphore.acquire()
    const releaseB = await semaphore.acquire()

    expect(semaphore.activeCount).toBe(2)
    releaseA()
    releaseA()
    expect(semaphore.activeCount).toBe(1)
    releaseB()
    expect(semaphore.activeCount).toBe(0)
    releaseB()
    expect(semaphore.activeCount).toBe(0)
  })

  it('grants queued waiters in FIFO order and never exceeds max active count', async () => {
    const semaphore = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 3, queueTimeoutMs: 1000 })
    const releaseFirst = await semaphore.acquire()
    const order = []
    const second = semaphore.acquire().then((release) => {
      order.push('second')
      return release
    })
    const third = semaphore.acquire().then((release) => {
      order.push('third')
      return release
    })

    expect(semaphore.activeCount).toBe(1)
    expect(semaphore.queueSize).toBe(2)

    releaseFirst()
    const releaseSecond = await second
    expect(order).toEqual(['second'])
    expect(semaphore.activeCount).toBe(1)

    releaseSecond()
    const releaseThird = await third
    expect(order).toEqual(['second', 'third'])
    expect(semaphore.activeCount).toBe(1)

    releaseThird()
    expect(semaphore.activeCount).toBe(0)
    expect(semaphore.queueSize).toBe(0)
  })

  it('rejects when queueing is disabled or full with stable capacity errors', async () => {
    const disabledQueue = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 0, queueTimeoutMs: 1000 })
    const release = await disabledQueue.acquire()

    await expect(disabledQueue.acquire()).rejects.toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      statusCode: 503,
      details: [{ reason: 'capacity_reached' }]
    })
    release()

    const fullQueue = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 1, queueTimeoutMs: 1000 })
    const releaseActive = await fullQueue.acquire()
    void fullQueue.acquire()

    await expect(fullQueue.acquire()).rejects.toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      statusCode: 503,
      details: [{ reason: 'queue_full' }]
    })
    releaseActive()
  })

  it('times out queued requests and timed-out waiters never receive permits', async () => {
    vi.useFakeTimers()
    const semaphore = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 1, queueTimeoutMs: 100 })
    const releaseActive = await semaphore.acquire()
    const queued = semaphore.acquire()
    const timeoutExpectation = expect(queued).rejects.toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      details: [{ reason: 'queue_timeout' }]
    })

    await vi.advanceTimersByTimeAsync(100)

    await timeoutExpectation
    expect(semaphore.queueSize).toBe(0)
    expect(semaphore.activeCount).toBe(1)

    releaseActive()
    expect(semaphore.activeCount).toBe(0)
  })

  it('clears queue timers when waiters acquire or time out', async () => {
    vi.useFakeTimers()
    const clearTimer = vi.fn(clearTimeout)
    const semaphore = createAuditSemaphore({
      maxConcurrent: 1,
      maxQueueSize: 2,
      queueTimeoutMs: 100,
      setTimer: setTimeout,
      clearTimer
    })
    const releaseActive = await semaphore.acquire()
    const acquired = semaphore.acquire()

    releaseActive()
    const releaseQueued = await acquired
    expect(clearTimer).toHaveBeenCalledTimes(1)

    const timedOut = semaphore.acquire()
    const timeoutExpectation = expect(timedOut).rejects.toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      details: [{ reason: 'queue_timeout' }]
    })
    await vi.advanceTimersByTimeAsync(100)
    await timeoutExpectation
    expect(clearTimer).toHaveBeenCalledTimes(2)
    releaseQueued()
  })

  it('supports abort-aware acquire calls', async () => {
    vi.useFakeTimers()
    const semaphore = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 1, queueTimeoutMs: 1000 })
    const alreadyAborted = new AbortController()
    alreadyAborted.abort(new Error('already aborted'))

    await expect(semaphore.acquire({ signal: alreadyAborted.signal })).rejects.toThrow('already aborted')

    const releaseActive = await semaphore.acquire()
    const queuedAbort = new AbortController()
    const queued = semaphore.acquire({ signal: queuedAbort.signal })

    expect(semaphore.queueSize).toBe(1)
    queuedAbort.abort(new Error('queued aborted'))
    await expect(queued).rejects.toThrow('queued aborted')
    expect(semaphore.queueSize).toBe(0)

    releaseActive()
    expect(semaphore.activeCount).toBe(0)
  })

  it('skips an aborted waiter and grants the next valid waiter', async () => {
    vi.useFakeTimers()
    const clearTimer = vi.fn(clearTimeout)
    const semaphore = createAuditSemaphore({
      maxConcurrent: 1,
      maxQueueSize: 2,
      queueTimeoutMs: 1000,
      setTimer: setTimeout,
      clearTimer
    })
    const releaseA = await semaphore.acquire()
    const bAbort = new AbortController()
    let bReceivedPermit = false
    const b = semaphore.acquire({ signal: bAbort.signal }).then((release) => {
      bReceivedPermit = true
      return release
    })
    const bRejection = expect(b).rejects.toThrow()
    const c = semaphore.acquire()

    expect(semaphore.queueSize).toBe(2)
    bAbort.abort()
    await bRejection
    expect(bReceivedPermit).toBe(false)
    expect(semaphore.queueSize).toBe(1)

    releaseA()
    const releaseC = await c

    expect(semaphore.activeCount).toBe(1)
    expect(semaphore.queueSize).toBe(0)
    expect(clearTimer).toHaveBeenCalled()
    releaseC()
    expect(semaphore.activeCount).toBe(0)
  })

  it('skips timed-out waiters and grants the next valid waiter exactly once', async () => {
    vi.useFakeTimers()
    const semaphore = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 3, queueTimeoutMs: 100 })
    const releaseA = await semaphore.acquire()
    let cPermitCount = 0
    const b = semaphore.acquire()
    const bTimeout = expect(b).rejects.toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      details: [{ reason: 'queue_timeout' }]
    })
    const invalid = semaphore.acquire()
    const invalidTimeout = expect(invalid).rejects.toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      details: [{ reason: 'queue_timeout' }]
    })

    await vi.advanceTimersByTimeAsync(100)
    await bTimeout
    await invalidTimeout

    const c = semaphore.acquire().then((release) => {
      cPermitCount += 1
      return release
    })

    expect(semaphore.queueSize).toBe(1)
    releaseA()
    const releaseC = await c

    expect(cPermitCount).toBe(1)
    expect(semaphore.activeCount).toBe(1)
    releaseC()
    expect(semaphore.activeCount).toBe(0)
  })

  it('does not let a new caller bypass an existing queued waiter during handoff', async () => {
    const semaphore = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 2, queueTimeoutMs: 1000 })
    const releaseA = await semaphore.acquire()
    const order = []
    const b = semaphore.acquire().then((release) => {
      order.push('B')
      return release
    })

    releaseA()
    const c = semaphore.acquire().then((release) => {
      order.push('C')
      return release
    })

    const releaseB = await b
    expect(order).toEqual(['B'])
    releaseB()
    const releaseC = await c
    expect(order).toEqual(['B', 'C'])
    releaseC()
  })

  it('handles abort or timeout racing with release without double settlement or state corruption', async () => {
    vi.useFakeTimers()
    const abortSemaphore = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 1, queueTimeoutMs: 1000 })
    const abortReleaseA = await abortSemaphore.acquire()
    const abortController = new AbortController()
    const queuedAbort = abortSemaphore.acquire({ signal: abortController.signal })
    const queuedAbortRejection = expect(queuedAbort).rejects.toThrow()

    abortController.abort()
    abortReleaseA()
    await queuedAbortRejection
    expect(abortSemaphore.activeCount).toBe(0)
    expect(abortSemaphore.queueSize).toBe(0)

    const timers = []
    const clearedTimers = []
    const timeoutSemaphore = createAuditSemaphore({
      maxConcurrent: 1,
      maxQueueSize: 1,
      queueTimeoutMs: 100,
      setTimer(callback) {
        const timer = { callback }
        timers.push(timer)
        return timer
      },
      clearTimer(timer) {
        clearedTimers.push(timer)
      }
    })
    const timeoutReleaseA = await timeoutSemaphore.acquire()
    const queuedTimeout = timeoutSemaphore.acquire()
    const timeoutRejection = expect(queuedTimeout).rejects.toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      details: [{ reason: 'queue_timeout' }]
    })

    timers[0].callback()
    timeoutReleaseA()
    await timeoutRejection
    expect(timeoutSemaphore.activeCount).toBe(0)
    expect(timeoutSemaphore.queueSize).toBe(0)

    const grantFirstSemaphore = createAuditSemaphore({
      maxConcurrent: 1,
      maxQueueSize: 1,
      queueTimeoutMs: 100,
      setTimer(callback) {
        const timer = { callback }
        timers.push(timer)
        return timer
      },
      clearTimer(timer) {
        clearedTimers.push(timer)
      }
    })
    const grantFirstReleaseA = await grantFirstSemaphore.acquire()
    const queuedGrant = grantFirstSemaphore.acquire()
    grantFirstReleaseA()
    const releaseQueuedGrant = await queuedGrant
    timers.at(-1).callback()
    expect(grantFirstSemaphore.activeCount).toBe(1)
    releaseQueuedGrant()
    expect(grantFirstSemaphore.activeCount).toBe(0)
    expect(clearedTimers.length).toBeGreaterThanOrEqual(2)
  })

  it('ignores aborts after permit grant and after timeout rejection', async () => {
    vi.useFakeTimers()
    const grantedSemaphore = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 1, queueTimeoutMs: 1000 })
    const grantedAbort = new AbortController()
    const releaseGranted = await grantedSemaphore.acquire({ signal: grantedAbort.signal })
    grantedAbort.abort()
    expect(grantedSemaphore.activeCount).toBe(1)
    releaseGranted()
    expect(grantedSemaphore.activeCount).toBe(0)

    const timeoutSemaphore = createAuditSemaphore({ maxConcurrent: 1, maxQueueSize: 1, queueTimeoutMs: 100 })
    const releaseActive = await timeoutSemaphore.acquire()
    const abortAfterTimeout = new AbortController()
    const queued = timeoutSemaphore.acquire({ signal: abortAfterTimeout.signal })
    const timeoutRejection = expect(queued).rejects.toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      details: [{ reason: 'queue_timeout' }]
    })

    await vi.advanceTimersByTimeAsync(100)
    await timeoutRejection
    abortAfterTimeout.abort()
    releaseActive()
    expect(timeoutSemaphore.activeCount).toBe(0)
    expect(timeoutSemaphore.queueSize).toBe(0)
  })
})
