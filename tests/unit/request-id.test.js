import { describe, expect, it } from 'vitest'
import { isUsableRequestId } from '../../src/middleware/request-id.middleware.js'

describe('request ID validation', () => {
  it('accepts a normal valid ID', () => {
    expect(isUsableRequestId('phase1-test-id_123')).toBe(true)
  })

  it('rejects whitespace', () => {
    expect(isUsableRequestId('has space')).toBe(false)
    expect(isUsableRequestId('   ')).toBe(false)
  })

  it('rejects invalid characters', () => {
    expect(isUsableRequestId('invalid/request/id')).toBe(false)
    expect(isUsableRequestId('invalid!')).toBe(false)
  })

  it('accepts exactly 80 characters', () => {
    expect(isUsableRequestId('a'.repeat(80))).toBe(true)
  })

  it('rejects 81 characters', () => {
    expect(isUsableRequestId('a'.repeat(81))).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isUsableRequestId('')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isUsableRequestId(undefined)).toBe(false)
    expect(isUsableRequestId(null)).toBe(false)
    expect(isUsableRequestId(['valid-id'])).toBe(false)
    expect(isUsableRequestId(123)).toBe(false)
  })
})
