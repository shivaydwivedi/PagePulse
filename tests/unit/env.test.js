import { describe, expect, it } from 'vitest'
import { parseEnv } from '../../src/config/env.js'

describe('environment configuration', () => {
  it('uses valid defaults', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      REQUEST_BODY_LIMIT: '16kb',
      AUDIT_TIMEOUT_MS: 8000,
      AUDIT_MAX_REDIRECTS: 5,
      AUDIT_MAX_RESPONSE_BYTES: 1048576,
      AUDIT_USER_AGENT: 'PagePulseBot/1.0'
    })
  })

  it('rejects an invalid port', () => {
    expect(() => parseEnv({ PORT: '70000' })).toThrow()
    expect(() => parseEnv({ PORT: 'not-a-port' })).toThrow()
  })

  it('rejects an invalid log level', () => {
    expect(() => parseEnv({ LOG_LEVEL: 'verbose' })).toThrow()
  })

  it('accepts valid request body limits', () => {
    expect(parseEnv({ REQUEST_BODY_LIMIT: '16kb' }).REQUEST_BODY_LIMIT).toBe('16kb')
    expect(parseEnv({ REQUEST_BODY_LIMIT: '2MB' }).REQUEST_BODY_LIMIT).toBe('2MB')
  })

  it('rejects invalid request body limits', () => {
    expect(() => parseEnv({ REQUEST_BODY_LIMIT: '0kb' })).toThrow()
    expect(() => parseEnv({ REQUEST_BODY_LIMIT: '16gb' })).toThrow()
    expect(() => parseEnv({ REQUEST_BODY_LIMIT: '   ' })).toThrow()
  })

  it('validates audit HTTP client configuration', () => {
    expect(parseEnv({ AUDIT_TIMEOUT_MS: '500' }).AUDIT_TIMEOUT_MS).toBe(500)
    expect(() => parseEnv({ AUDIT_TIMEOUT_MS: '499' })).toThrow()
    expect(() => parseEnv({ AUDIT_TIMEOUT_MS: '30001' })).toThrow()
    expect(parseEnv({ AUDIT_MAX_REDIRECTS: '0' }).AUDIT_MAX_REDIRECTS).toBe(0)
    expect(() => parseEnv({ AUDIT_MAX_REDIRECTS: '-1' })).toThrow()
    expect(() => parseEnv({ AUDIT_MAX_REDIRECTS: '11' })).toThrow()
    expect(parseEnv({ AUDIT_MAX_RESPONSE_BYTES: '1024' }).AUDIT_MAX_RESPONSE_BYTES).toBe(1024)
    expect(() => parseEnv({ AUDIT_MAX_RESPONSE_BYTES: '1023' })).toThrow()
    expect(() => parseEnv({ AUDIT_MAX_RESPONSE_BYTES: '5242881' })).toThrow()
    expect(parseEnv({ AUDIT_USER_AGENT: 'PagePulseBot/2.0' }).AUDIT_USER_AGENT).toBe('PagePulseBot/2.0')
    expect(parseEnv({ AUDIT_USER_AGENT: 'a'.repeat(120) }).AUDIT_USER_AGENT).toBe('a'.repeat(120))
    expect(() => parseEnv({ AUDIT_USER_AGENT: '' })).toThrow()
    expect(() => parseEnv({ AUDIT_USER_AGENT: '   ' })).toThrow()
    expect(() => parseEnv({ AUDIT_USER_AGENT: 'bad\ragent' })).toThrow()
    expect(() => parseEnv({ AUDIT_USER_AGENT: 'bad\nagent' })).toThrow()
    expect(() => parseEnv({ AUDIT_USER_AGENT: 'bad\r\nagent' })).toThrow()
    expect(() => parseEnv({ AUDIT_USER_AGENT: 'a'.repeat(121) })).toThrow()
  })
})
