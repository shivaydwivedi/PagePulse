import ipaddr from 'ipaddr.js'

const unknownClientKey = 'unknown-client'

export function normalizeClientIp(rawIp) {
  if (typeof rawIp !== 'string') {
    return unknownClientKey
  }

  const trimmedIp = rawIp.trim().toLowerCase()
  if (!trimmedIp) {
    return unknownClientKey
  }

  try {
    const parsedAddress = ipaddr.parse(trimmedIp)

    if (parsedAddress.kind() === 'ipv6' && parsedAddress.isIPv4MappedAddress()) {
      return parsedAddress.toIPv4Address().toString()
    }

    return parsedAddress.toNormalizedString()
  } catch {
    return unknownClientKey
  }
}
