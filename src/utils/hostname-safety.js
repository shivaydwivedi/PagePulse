const blockedHostnames = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'broadcasthost',
  'localhost.localdomain'
])

export function normalizeHostnameForSafety(hostname) {
  return hostname.toLowerCase().replace(/\.$/, '')
}

export function isBlockedHostname(hostname) {
  const normalizedHostname = normalizeHostnameForSafety(hostname)

  return blockedHostnames.has(normalizedHostname) || normalizedHostname.endsWith('.localhost')
}
