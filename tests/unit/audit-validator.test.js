import { describe, expect, it } from 'vitest'
import { validateAuditRequestBody } from '../../src/validators/audit.validator.js'

describe('validateAuditRequestBody', () => {
  it('accepts an object with only a URL', () => {
    expect(validateAuditRequestBody({ url: 'https://example.com' })).toEqual({
      url: 'https://example.com'
    })
  })

  it('rejects missing or invalid request bodies', () => {
    for (const body of [undefined, null, [], 'https://example.com']) {
      expect(() => validateAuditRequestBody(body)).toThrow('Request validation failed.')
    }
  })

  it('rejects missing URL values', () => {
    expect(() => validateAuditRequestBody({})).toThrow('Request validation failed.')
  })

  it('rejects non-string URL values', () => {
    for (const url of [null, 123, ['https://example.com'], { href: 'https://example.com' }]) {
      expect(() => validateAuditRequestBody({ url })).toThrow('Request validation failed.')
    }
  })

  it('rejects empty and whitespace-only URLs', () => {
    expect(() => validateAuditRequestBody({ url: '' })).toThrow('Request validation failed.')
    expect(() => validateAuditRequestBody({ url: '   ' })).toThrow('Request validation failed.')
  })

  it('rejects URLs longer than 2048 characters', () => {
    expect(() => validateAuditRequestBody({ url: `https://example.com/${'a'.repeat(2048)}` })).toThrow('Request validation failed.')
  })

  it('rejects unknown fields', () => {
    expect(() => validateAuditRequestBody({
      url: 'https://example.com',
      extra: true
    })).toThrow('Request validation failed.')
  })
})
