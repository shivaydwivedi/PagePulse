import { resolveHostname } from '../infrastructure/dns/resolver.js'
import { isBlockedHostname } from '../utils/hostname-safety.js'
import { classifyIpAddress, getIpAddressFamily, isIpAddress } from '../utils/ip-address.js'
import { AppError } from '../utils/errors.js'

function blockedTargetError(hostname) {
  return new AppError({
    code: 'BLOCKED_TARGET',
    message: 'The requested URL resolves to a destination that is not allowed.',
    statusCode: 400,
    details: [
      {
        field: 'url',
        reason: 'blocked_destination',
        hostname
      }
    ]
  })
}

function dnsLookupFailedError(hostname, cause) {
  return new AppError({
    code: 'DNS_LOOKUP_FAILED',
    message: 'The destination hostname could not be resolved.',
    statusCode: 502,
    details: [{ field: 'url', hostname }],
    cause
  })
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
  }
}

function assertSafeAddress(address, hostname, expectedFamily) {
  const actualFamily = getIpAddressFamily(address)

  if (actualFamily !== expectedFamily) {
    throw blockedTargetError(hostname)
  }

  const classification = classifyIpAddress(address)

  if (!classification.safe) {
    throw blockedTargetError(hostname)
  }
}

export function createDestinationSafetyService(options = {}) {
  const resolver = options.resolver ?? resolveHostname

  async function validateDestination(normalisedUrl, options = {}) {
    const { signal } = options
    throwIfAborted(signal)

    const url = new URL(normalisedUrl)
    const hostname = url.hostname

    if (isBlockedHostname(hostname)) {
      throw blockedTargetError(hostname)
    }

    if (isIpAddress(hostname)) {
      const family = getIpAddressFamily(hostname)
      assertSafeAddress(hostname, hostname, family)
      return {
        hostname,
        addresses: [{ address: hostname, family }]
      }
    }

    let resolvedAddresses

    try {
      resolvedAddresses = await resolver(hostname, { signal })
    } catch (error) {
      if (error instanceof AppError && error.code === 'DNS_LOOKUP_FAILED') {
        throw error
      }

      throw dnsLookupFailedError(hostname, error)
    }

    if (!Array.isArray(resolvedAddresses) || resolvedAddresses.length === 0) {
      throw dnsLookupFailedError(hostname)
    }

    throwIfAborted(signal)

    for (const result of resolvedAddresses) {
      if (![4, 6].includes(result?.family) || typeof result.address !== 'string') {
        throw blockedTargetError(hostname)
      }

      assertSafeAddress(result.address, hostname, result.family)
    }

    return {
      hostname,
      addresses: resolvedAddresses.map((result) => ({
        address: result.address,
        family: result.family
      }))
    }
  }

  return {
    validateDestination
  }
}
