import { performance } from 'node:perf_hooks'
import { request as undiciRequest } from 'undici'
import { normalizeAuditUrl } from '../../utils/normalize-url.js'
import { isSupportedHtmlContentType } from '../../utils/content-type.js'
import { createUpstreamError, mapUpstreamError } from '../../utils/upstream-error.js'
import { createApprovedAddressDispatcher } from './approved-address-dispatcher.js'

const redirectStatuses = new Set([301, 302, 303, 307, 308])
const retainedHeaders = new Set([
  'content-type',
  'content-length',
  'location',
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy'
])

function getHeader(headers, name) {
  const value = headers[name.toLowerCase()]

  return Array.isArray(value) ? value.join(', ') : value
}

function retainSafeHeaders(headers) {
  const safeHeaders = {}

  for (const [name, value] of Object.entries(headers)) {
    if (retainedHeaders.has(name.toLowerCase())) {
      safeHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value
    }
  }

  return safeHeaders
}

function parseContentLength(value) {
  if (value === undefined) {
    return undefined
  }

  if (!/^\d+$/.test(value)) {
    return Number.POSITIVE_INFINITY
  }

  return Number(value)
}

function buildOutboundHeaders(userAgent) {
  return {
    accept: 'text/html,application/xhtml+xml;q=0.9',
    'user-agent': userAgent,
    'accept-encoding': 'identity'
  }
}

async function cancelBody(body) {
  if (typeof body?.destroy === 'function') {
    body.destroy(new Error('PagePulse cancelled upstream response body.'))
    return
  }

  if (typeof body?.cancel === 'function') {
    await body.cancel(new Error('PagePulse cancelled upstream response body.'))
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  }
}

function raceWithAbort(value, signal) {
  const promise = Promise.resolve(value)

  if (!signal) {
    return promise
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(signal.reason ?? new DOMException('The operation was aborted.', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

async function readLimitedBody(body, maxBytes, signal) {
  const chunks = []
  let totalBytes = 0
  const iterator = body?.[Symbol.asyncIterator]?.() ?? body?.[Symbol.iterator]?.()

  if (!iterator) {
    throw createUpstreamError({
      code: 'UPSTREAM_REQUEST_FAILED',
      message: 'PagePulse could not complete the destination request.',
      statusCode: 502
    })
  }

  try {
    while (true) {
      throwIfAborted(signal)

      const nextChunk = await raceWithAbort(iterator.next(), signal)

      if (nextChunk.done) {
        break
      }

      const chunk = nextChunk.value
      const buffer = Buffer.from(chunk)
      totalBytes += buffer.length

      if (totalBytes > maxBytes) {
        throw createUpstreamError({
          code: 'RESPONSE_TOO_LARGE',
          message: 'The destination response exceeded the allowed size.',
          statusCode: 502
        })
      }

      chunks.push(buffer)
    }
  } catch (error) {
    await cancelBody(body)
    throw error
  }

  return Buffer.concat(chunks, totalBytes)
}

function resolveRedirectUrl(location, currentUrl) {
  if (typeof location !== 'string' || location.trim().length === 0) {
    throw createUpstreamError({
      code: 'INVALID_REDIRECT',
      message: 'The destination returned an invalid redirect.',
      statusCode: 502
    })
  }

  try {
    return normalizeAuditUrl(new URL(location, currentUrl).toString())
  } catch (error) {
    throw createUpstreamError({
      code: 'INVALID_REDIRECT',
      message: 'The destination returned an invalid redirect.',
      statusCode: 502,
      cause: error
    })
  }
}

export function createAuditHttpClient(options) {
  const {
    config,
    destinationSafetyService,
    dispatcherFactory = createApprovedAddressDispatcher,
    requestFn = undiciRequest,
    clock = {
      now: () => performance.now(),
      date: () => new Date()
    }
  } = options

  async function fetchAuditTarget(normalisedUrl) {
    const startedAt = clock.now()
    const timeoutController = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      timeoutController.abort()
    }, config.AUDIT_TIMEOUT_MS)

    try {
      let currentUrl = normalisedUrl
      let redirectCount = 0

      while (true) {
        throwIfAborted(timeoutController.signal)

        const destination = await destinationSafetyService.validateDestination(currentUrl, {
          signal: timeoutController.signal
        })

        throwIfAborted(timeoutController.signal)

        const approvedDispatcher = dispatcherFactory(destination)

        try {
          throwIfAborted(timeoutController.signal)

          const response = await requestFn(currentUrl, {
            method: 'GET',
            headers: buildOutboundHeaders(config.AUDIT_USER_AGENT),
            maxRedirections: 0,
            dispatcher: approvedDispatcher.dispatcher,
            signal: timeoutController.signal
          })

          const headers = retainSafeHeaders(response.headers)
          const location = getHeader(response.headers, 'location')

          if (redirectStatuses.has(response.statusCode)) {
            await cancelBody(response.body)

            if (!location) {
              throw createUpstreamError({
                code: 'INVALID_REDIRECT',
                message: 'The destination returned an invalid redirect.',
                statusCode: 502
              })
            }

            if (redirectCount >= config.AUDIT_MAX_REDIRECTS) {
              throw createUpstreamError({
                code: 'TOO_MANY_REDIRECTS',
                message: 'The destination exceeded the allowed redirect limit.',
                statusCode: 502
              })
            }

            currentUrl = resolveRedirectUrl(location, currentUrl)
            redirectCount += 1
            continue
          }

          const contentType = getHeader(response.headers, 'content-type')

          if (!isSupportedHtmlContentType(contentType)) {
            await cancelBody(response.body)
            throw createUpstreamError({
              code: 'UPSTREAM_UNSUPPORTED_CONTENT',
              message: 'The destination did not return a supported HTML content type.',
              statusCode: 422
            })
          }

          const contentLength = parseContentLength(getHeader(response.headers, 'content-length'))

          if (contentLength > config.AUDIT_MAX_RESPONSE_BYTES) {
            await cancelBody(response.body)
            throw createUpstreamError({
              code: 'RESPONSE_TOO_LARGE',
              message: 'The destination response exceeded the allowed size.',
              statusCode: 502
            })
          }

          const body = await readLimitedBody(response.body, config.AUDIT_MAX_RESPONSE_BYTES, timeoutController.signal)

          return {
            requestedUrl: normalisedUrl,
            finalUrl: currentUrl,
            statusCode: response.statusCode,
            headers,
            contentType,
            responseSizeBytes: body.length,
            responseTimeMs: Math.max(0, Math.round(clock.now() - startedAt)),
            redirectCount,
            auditedAt: clock.date().toISOString(),
            body
          }
        } finally {
          await approvedDispatcher.close?.()
        }
      }
    } catch (error) {
      throw mapUpstreamError(error, { timedOut })
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    fetchAuditTarget
  }
}
