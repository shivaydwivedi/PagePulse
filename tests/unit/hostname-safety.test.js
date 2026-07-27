import { describe, expect, it } from 'vitest'
import { isBlockedHostname, normalizeHostnameForSafety } from '../../src/utils/hostname-safety.js'

describe('hostname safety', () => {
  it('normalises hostnames for comparison', () => {
    expect(normalizeHostnameForSafety('LOCALHOST.')).toBe('localhost')
  })

  it('blocks explicit localhost names', () => {
    for (const hostname of [
      'localhost',
      'LOCALHOST',
      'localhost.',
      'subdomain.localhost',
      'example.localhost.',
      'ip6-localhost',
      'ip6-loopback',
      'broadcasthost',
      'localhost.localdomain'
    ]) {
      expect(isBlockedHostname(hostname)).toBe(true)
    }
  })

  it('does not use unsafe substring matching', () => {
    expect(isBlockedHostname('localhost.example.com')).toBe(false)
    expect(isBlockedHostname('notlocalhost')).toBe(false)
    expect(isBlockedHostname('example.com')).toBe(false)
    expect(isBlockedHostname('example.com.')).toBe(false)
  })
})
