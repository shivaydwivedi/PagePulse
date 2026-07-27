import dns from 'node:dns/promises'
import { AppError } from '../../utils/errors.js'

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  }
}

function raceWithAbort(promise, signal) {
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

export function createDnsResolver(lookup = dns.lookup) {
  return async function resolveHostname(hostname, options = {}) {
    const { signal } = options

    try {
      throwIfAborted(signal)

      const lookupPromise = lookup(hostname, {
        all: true,
        verbatim: true
      })
      const addresses = await raceWithAbort(lookupPromise, signal)

      throwIfAborted(signal)

      return addresses.map((result) => ({
        address: result.address,
        family: result.family
      }))
    } catch (error) {
      throw new AppError({
        code: 'DNS_LOOKUP_FAILED',
        message: 'The destination hostname could not be resolved.',
        statusCode: 502,
        details: [{ field: 'url', hostname }],
        cause: error
      })
    }
  }
}

export const resolveHostname = createDnsResolver()
