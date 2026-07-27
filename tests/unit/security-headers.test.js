import { describe, expect, it } from 'vitest'
import { analyseSecurityHeaders } from '../../src/analyzers/security-headers.analyzer.js'

const completeHeaders = {
  'content-security-policy': "default-src 'self'",
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'NoSniff',
  'x-frame-options': 'sameorigin',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=()'
}

describe('security headers analyzer', () => {
  it('passes the complete retained header set with case-insensitive known values', () => {
    const result = analyseSecurityHeaders(completeHeaders, { finalUrl: 'https://example.com/' })

    expect(result.check.status).toBe('pass')
    expect(result.issues).toEqual([])
  })

  it('warns deterministically for missing or invalid headers', () => {
    const result = analyseSecurityHeaders({
      'x-content-type-options': 'maybe',
      'x-frame-options': 'ALLOWALL',
      'set-cookie': 'session=secret',
      'x-unretained-debug': 'ignored'
    }, { finalUrl: 'https://example.com/' })

    expect(result.check.status).toBe('warning')
    expect(result.check.details.strictTransportSecurity).toMatchObject({ status: 'warning', applicable: true })
    expect(result.issues.map((item) => item.code)).toEqual([
      'MISSING_CONTENT_SECURITY_POLICY',
      'MISSING_STRICT_TRANSPORT_SECURITY',
      'INVALID_X_CONTENT_TYPE_OPTIONS',
      'MISSING_X_FRAME_OPTIONS',
      'MISSING_REFERRER_POLICY',
      'MISSING_PERMISSIONS_POLICY'
    ])
    expect(JSON.stringify(result)).not.toContain('session=secret')
    expect(JSON.stringify(result)).not.toContain('ignored')
  })

  it('handles joined multi-value headers with the basic Phase 5 policy', () => {
    const result = analyseSecurityHeaders({
      'content-security-policy': "default-src 'self', default-src 'none'",
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff, nosniff',
      'x-frame-options': 'DENY, SAMEORIGIN',
      'referrer-policy': 'strict-origin, no-referrer',
      'permissions-policy': 'geolocation=(), camera=()'
    }, { finalUrl: 'https://example.com/' })

    expect(result.check.details.contentSecurityPolicy.status).toBe('pass')
    expect(result.check.details.xContentTypeOptions.status).toBe('warning')
    expect(result.check.details.xFrameOptions.status).toBe('warning')
    expect(result.check.details.referrerPolicy.status).toBe('pass')
    expect(result.check.details.permissionsPolicy.status).toBe('pass')
    expect(result.issues.map((item) => item.code)).toEqual([
      'INVALID_X_CONTENT_TYPE_OPTIONS',
      'MISSING_X_FRAME_OPTIONS'
    ])
  })

  it('treats HSTS as not applicable on HTTP final URLs and accepts DENY', () => {
    const result = analyseSecurityHeaders({
      ...completeHeaders,
      'x-frame-options': 'DENY'
    }, { finalUrl: 'http://example.com/' })

    expect(result.check.details.strictTransportSecurity.status).toBe('not_applicable')
    expect(result.check.details.strictTransportSecurity.applicable).toBe(false)
    expect(result.check.details.xFrameOptions.status).toBe('pass')
  })
})
