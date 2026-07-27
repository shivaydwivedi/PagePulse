import ipaddr from 'ipaddr.js'

const ipv4BlockedRanges = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32]
].map(([address, prefix]) => [ipaddr.parse(address), prefix])

const ipv6BlockedRanges = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8]
].map(([address, prefix]) => [ipaddr.parse(address), prefix])

function stripIpv6Brackets(rawAddress) {
  return rawAddress.startsWith('[') && rawAddress.endsWith(']')
    ? rawAddress.slice(1, -1)
    : rawAddress
}

function hasSuspiciousIPv4Text(address) {
  if (/^0x/i.test(address) || /^\d+$/.test(address)) {
    return true
  }

  const parts = address.split('.')

  if (parts.length !== 4) {
    return true
  }

  return parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part))
}

function matchesAnyRange(address, ranges) {
  return ranges.some(([rangeAddress, prefix]) => address.match(rangeAddress, prefix))
}

function classifyParsedAddress(address) {
  if (address.kind() === 'ipv4') {
    if (matchesAnyRange(address, ipv4BlockedRanges)) {
      return { safe: false, reason: 'blocked_destination' }
    }

    return address.range() === 'unicast'
      ? { safe: true, reason: 'public_unicast' }
      : { safe: false, reason: 'blocked_destination' }
  }

  if (address.isIPv4MappedAddress()) {
    return classifyParsedAddress(address.toIPv4Address())
  }

  if (matchesAnyRange(address, ipv6BlockedRanges)) {
    return { safe: false, reason: 'blocked_destination' }
  }

  return address.range() === 'unicast'
    ? { safe: true, reason: 'public_unicast' }
    : { safe: false, reason: 'blocked_destination' }
}

export function classifyIpAddress(rawAddress) {
  const addressText = stripIpv6Brackets(rawAddress)

  try {
    const address = ipaddr.parse(addressText)

    if (address.kind() === 'ipv4' && hasSuspiciousIPv4Text(addressText)) {
      return { safe: false, reason: 'unclassified_address' }
    }

    return classifyParsedAddress(address)
  } catch {
    return { safe: false, reason: 'unclassified_address' }
  }
}

export function isIpAddress(rawAddress) {
  return ipaddr.isValid(stripIpv6Brackets(rawAddress))
}

export function getIpAddressFamily(rawAddress) {
  try {
    return ipaddr.parse(stripIpv6Brackets(rawAddress)).kind() === 'ipv4' ? 4 : 6
  } catch {
    return undefined
  }
}
