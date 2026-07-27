import { describe, expect, it } from 'vitest'
import { parseEnv } from '../../src/config/env.js'

describe('environment configuration', () => {
  it('uses valid defaults', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      REQUEST_BODY_LIMIT: '16kb'
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
})
