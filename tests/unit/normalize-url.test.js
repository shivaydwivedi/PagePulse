import { describe, expect, it } from 'vitest'
import { AppError } from '../../src/utils/errors.js'
import { normalizeAuditUrl } from '../../src/utils/normalize-url.js'

describe('normalizeAuditUrl', () => {
  it('accepts valid HTTP URLs', () => {
    expect(normalizeAuditUrl('http://example.com')).toBe('http://example.com/')
  })

  it('accepts valid HTTPS URLs', () => {
    expect(normalizeAuditUrl('https://example.com')).toBe('https://example.com/')
  })

  it('rejects malformed URLs', () => {
    expect(() => normalizeAuditUrl('not a url')).toThrow(AppError)
    expect(() => normalizeAuditUrl('not a url')).toThrow('The provided URL is not valid.')
  })

  it('rejects unsupported protocols', () => {
    for (const rawUrl of [
      'ftp://example.com',
      'file:///tmp/example.html',
      'data:text/plain,hello',
      'javascript:alert(1)',
      'mailto:user@example.com',
      'ws://example.com',
      'wss://example.com'
    ]) {
      expect(() => normalizeAuditUrl(rawUrl)).toThrow('Only HTTP and HTTPS URLs are supported.')
    }
  })

  it('rejects embedded usernames and passwords', () => {
    expect(() => normalizeAuditUrl('https://user@example.com')).toThrow('URLs containing embedded credentials are not allowed.')
    expect(() => normalizeAuditUrl('https://user:password@example.com')).toThrow('URLs containing embedded credentials are not allowed.')
  })

  it('lowercases protocol and hostname', () => {
    expect(normalizeAuditUrl('HTTPS://EXAMPLE.com')).toBe('https://example.com/')
  })

  it('removes default HTTPS and HTTP ports', () => {
    expect(normalizeAuditUrl('https://example.com:443/path')).toBe('https://example.com/path')
    expect(normalizeAuditUrl('http://example.com:80')).toBe('http://example.com/')
  })

  it('preserves non-default ports', () => {
    expect(normalizeAuditUrl('https://example.com:8443/path')).toBe('https://example.com:8443/path')
  })

  it('preserves query strings and removes fragments', () => {
    expect(normalizeAuditUrl('https://example.com/path?q=1#section')).toBe('https://example.com/path?q=1')
  })

  it('preserves path case and meaningful trailing slashes', () => {
    expect(normalizeAuditUrl('https://example.com/CaseSensitive/')).toBe('https://example.com/CaseSensitive/')
  })

  it('trims surrounding whitespace before parsing', () => {
    expect(normalizeAuditUrl('  https://example.com/path  ')).toBe('https://example.com/path')
  })
})
