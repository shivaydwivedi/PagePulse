import { describe, expect, it } from 'vitest'
import { AppError } from '../../src/utils/errors.js'
import { createUpstreamError, mapUpstreamError } from '../../src/utils/upstream-error.js'

describe('upstream error mapping', () => {
  it('maps PagePulse timeouts to UPSTREAM_TIMEOUT', () => {
    expect(mapUpstreamError(new Error('aborted'), { timedOut: true })).toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      statusCode: 504
    })
  })

  it('maps connection, TLS, and unknown failures', () => {
    expect(mapUpstreamError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toMatchObject({
      code: 'UPSTREAM_CONNECTION_FAILED',
      statusCode: 502
    })
    expect(mapUpstreamError(Object.assign(new Error('tls'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }))).toMatchObject({
      code: 'UPSTREAM_TLS_ERROR',
      statusCode: 502
    })
    expect(mapUpstreamError(new Error('wrapped tls', {
      cause: Object.assign(new Error('tls'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })
    }))).toMatchObject({
      code: 'UPSTREAM_TLS_ERROR',
      statusCode: 502
    })
    expect(mapUpstreamError(new Error('wrapped connection', {
      cause: Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    }))).toMatchObject({
      code: 'UPSTREAM_CONNECTION_FAILED',
      statusCode: 502
    })
    expect(mapUpstreamError(new Error('wrapped unknown', {
      cause: Object.assign(new Error('unknown'), { code: 'SOMETHING_ELSE' })
    }))).toMatchObject({
      code: 'UPSTREAM_REQUEST_FAILED',
      statusCode: 502
    })
    expect(mapUpstreamError(new Error('unknown'))).toMatchObject({
      code: 'UPSTREAM_REQUEST_FAILED',
      statusCode: 502
    })
  })

  it('preserves existing application errors and causes', () => {
    const cause = new Error('internal')
    const appError = createUpstreamError({
      code: 'RESPONSE_TOO_LARGE',
      message: 'The destination response exceeded the allowed size.',
      statusCode: 502,
      cause
    })

    expect(appError.cause).toBe(cause)
    expect(mapUpstreamError(appError)).toBeInstanceOf(AppError)
    expect(mapUpstreamError(appError)).toBe(appError)
  })
})
