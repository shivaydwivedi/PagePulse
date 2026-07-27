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
      AUDIT_USER_AGENT: 'PagePulseBot/1.0',
      AUDIT_CACHE_ENABLED: true,
      AUDIT_CACHE_TTL_MS: 300000,
      AUDIT_CACHE_MAX_ENTRIES: 500,
      AUDIT_MAX_CONCURRENT: 5,
      AUDIT_MAX_QUEUE_SIZE: 50,
      AUDIT_QUEUE_TIMEOUT_MS: 2000
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

  it('validates audit cache configuration', () => {
    expect(parseEnv({ AUDIT_CACHE_ENABLED: 'true' }).AUDIT_CACHE_ENABLED).toBe(true)
    expect(parseEnv({ AUDIT_CACHE_ENABLED: 'false' }).AUDIT_CACHE_ENABLED).toBe(false)
    expect(parseEnv({ AUDIT_CACHE_ENABLED: '1' }).AUDIT_CACHE_ENABLED).toBe(true)
    expect(parseEnv({ AUDIT_CACHE_ENABLED: '0' }).AUDIT_CACHE_ENABLED).toBe(false)
    expect(() => parseEnv({ AUDIT_CACHE_ENABLED: 'yes' })).toThrow()

    expect(() => parseEnv({ AUDIT_CACHE_TTL_MS: '999' })).toThrow()
    expect(parseEnv({ AUDIT_CACHE_TTL_MS: '1000' }).AUDIT_CACHE_TTL_MS).toBe(1000)
    expect(parseEnv({ AUDIT_CACHE_TTL_MS: '3600000' }).AUDIT_CACHE_TTL_MS).toBe(3600000)
    expect(() => parseEnv({ AUDIT_CACHE_TTL_MS: '3600001' })).toThrow()

    expect(() => parseEnv({ AUDIT_CACHE_MAX_ENTRIES: '0' })).toThrow()
    expect(parseEnv({ AUDIT_CACHE_MAX_ENTRIES: '1' }).AUDIT_CACHE_MAX_ENTRIES).toBe(1)
    expect(parseEnv({ AUDIT_CACHE_MAX_ENTRIES: '5000' }).AUDIT_CACHE_MAX_ENTRIES).toBe(5000)
    expect(() => parseEnv({ AUDIT_CACHE_MAX_ENTRIES: '5001' })).toThrow()
  })

  it('validates audit concurrency configuration', () => {
    expect(() => parseEnv({ AUDIT_MAX_CONCURRENT: '0' })).toThrow()
    expect(parseEnv({ AUDIT_MAX_CONCURRENT: '1' }).AUDIT_MAX_CONCURRENT).toBe(1)
    expect(parseEnv({ AUDIT_MAX_CONCURRENT: '50' }).AUDIT_MAX_CONCURRENT).toBe(50)
    expect(() => parseEnv({ AUDIT_MAX_CONCURRENT: '51' })).toThrow()

    expect(() => parseEnv({ AUDIT_MAX_QUEUE_SIZE: '-1' })).toThrow()
    expect(parseEnv({ AUDIT_MAX_QUEUE_SIZE: '0' }).AUDIT_MAX_QUEUE_SIZE).toBe(0)
    expect(parseEnv({ AUDIT_MAX_QUEUE_SIZE: '500' }).AUDIT_MAX_QUEUE_SIZE).toBe(500)
    expect(() => parseEnv({ AUDIT_MAX_QUEUE_SIZE: '501' })).toThrow()

    expect(() => parseEnv({ AUDIT_QUEUE_TIMEOUT_MS: '99' })).toThrow()
    expect(parseEnv({ AUDIT_QUEUE_TIMEOUT_MS: '100' }).AUDIT_QUEUE_TIMEOUT_MS).toBe(100)
    expect(parseEnv({ AUDIT_QUEUE_TIMEOUT_MS: '30000' }).AUDIT_QUEUE_TIMEOUT_MS).toBe(30000)
    expect(() => parseEnv({ AUDIT_QUEUE_TIMEOUT_MS: '30001' })).toThrow()
  })
})
