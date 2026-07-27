import { describe, expect, it } from 'vitest'
import { normalizeClientIp } from '../../src/utils/client-identity.js'

describe('client identity normalisation', () => {
  it('normalises IPv4, IPv6, IPv4-mapped IPv6, and surrounding whitespace', () => {
    expect(normalizeClientIp('  203.0.113.10  ')).toBe('203.0.113.10')
    expect(normalizeClientIp('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8:0:0:0:0:0:1')
    expect(normalizeClientIp('::ffff:127.0.0.1')).toBe('127.0.0.1')
  })

  it('uses a shared fallback for unavailable client IPs', () => {
    expect(normalizeClientIp()).toBe('unknown-client')
    expect(normalizeClientIp(null)).toBe('unknown-client')
    expect(normalizeClientIp('')).toBe('unknown-client')
    expect(normalizeClientIp('   ')).toBe('unknown-client')
  })

  it('does not use request IDs or URLs as client keys', () => {
    expect(normalizeClientIp('https://example.com')).toBe('unknown-client')
    expect(normalizeClientIp('phase8-request-id')).toBe('unknown-client')
  })
})
