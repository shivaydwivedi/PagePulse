import { describe, expect, it } from 'vitest'
import {
  checkOrder,
  getRetryAfterSeconds,
  maxRetryAfterSeconds,
  normaliseThemeMode,
  validateSuccessEnvelope
} from '../../public/ui-core.js'

function validCheck(status = 'pass') {
  return {
    status,
    summary: 'The check returned a safe summary.',
    details: {
      value: 'safe detail',
      count: 1,
      values: ['one', 'two']
    }
  }
}

function validBreakdownEntry(status = 'pass') {
  return {
    status,
    applicable: true,
    earnedPoints: status === 'fail' ? 0 : 10,
    weight: 10
  }
}

function validEnvelope(overrides = {}) {
  const checks = Object.fromEntries(checkOrder.map((key) => [key, validCheck()]))
  const breakdown = Object.fromEntries(checkOrder.map((key) => [key, validBreakdownEntry()]))
  const { data: dataOverrides, ...topLevelOverrides } = overrides

  return {
    success: true,
    requestId: 'phase10-request-id',
    data: {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/final',
      httpStatus: 200,
      redirectCount: 0,
      responseTimeMs: 42,
      contentType: 'text/html; charset=utf-8',
      responseSizeBytes: 12345,
      auditedAt: '2026-07-27T00:00:00.000Z',
      auditStatus: 'complete',
      cached: false,
      score: 95,
      grade: 'A',
      scoring: {
        scoringPolicyVersion: '1.0',
        earnedPoints: 95,
        possiblePoints: 100,
        excludedPoints: 0,
        breakdown
      },
      page: {
        title: 'Example Domain',
        metaDescription: 'A useful page summary for validation tests.',
        canonicalUrl: 'https://example.com/',
        language: 'en',
        headingCount: 1,
        imageCount: 0,
        linkCount: 1
      },
      checks,
      issues: [],
      ...dataOverrides
    },
    ...topLevelOverrides
  }
}

function expectInvalid(body) {
  expect(validateSuccessEnvelope(body).valid).toBe(false)
}

describe('public UI success response validation', () => {
  it('accepts a valid success response and ignores unknown extra fields', () => {
    const envelope = validEnvelope({ extra: true, data: { extraField: '<ignored>' } })

    expect(validateSuccessEnvelope(envelope)).toEqual({
      valid: true,
      data: envelope.data,
      requestId: 'phase10-request-id'
    })
  })

  it('accepts successful audits with nullable page metadata', () => {
    const envelope = validEnvelope({
      data: {
        page: {
          title: 'Example Domain',
          metaDescription: null,
          canonicalUrl: null,
          language: 'en',
          headingCount: 1,
          imageCount: 0,
          linkCount: 1
        }
      }
    })

    expect(validateSuccessEnvelope(envelope)).toEqual({
      valid: true,
      data: envelope.data,
      requestId: 'phase10-request-id'
    })
  })

  it('accepts successful audits with populated page metadata', () => {
    const envelope = validEnvelope({
      data: {
        page: {
          title: 'Populated Page',
          metaDescription: 'This page has a normal meta description.',
          canonicalUrl: 'https://example.com/canonical',
          language: 'en-US',
          headingCount: 2,
          imageCount: 1,
          linkCount: 3
        }
      }
    })

    expect(validateSuccessEnvelope(envelope).valid).toBe(true)
  })

  it('rejects malformed non-null page metadata values', () => {
    for (const value of [123, { text: 'bad' }]) {
      expectInvalid(validEnvelope({ data: { page: { ...validEnvelope().data.page, metaDescription: value } } }))
      expectInvalid(validEnvelope({ data: { page: { ...validEnvelope().data.page, canonicalUrl: value } } }))
    }
  })

  it('accepts the complete cached example.com production response shape', () => {
    const envelope = validEnvelope({
      requestId: 'render-request-id',
      data: {
        requestedUrl: 'https://example.com/',
        finalUrl: 'https://example.com/',
        httpStatus: 200,
        redirectCount: 0,
        responseTimeMs: 137,
        contentType: 'text/html',
        responseSizeBytes: 1256,
        auditedAt: '2026-07-27T00:00:00.000Z',
        auditStatus: 'complete',
        cached: true,
        score: 82,
        grade: 'B',
        scoring: {
          scoringPolicyVersion: '1.0',
          earnedPoints: 82,
          possiblePoints: 100,
          excludedPoints: 0,
          breakdown: Object.fromEntries(checkOrder.map((key) => [key, validBreakdownEntry(key === 'securityHeaders' ? 'warning' : 'pass')]))
        },
        page: {
          title: 'Example Domain',
          metaDescription: null,
          canonicalUrl: null,
          language: 'en',
          headingCount: 1,
          imageCount: 0,
          linkCount: 1
        },
        checks: {
          ...Object.fromEntries(checkOrder.map((key) => [key, validCheck()])),
          securityHeaders: {
            status: 'warning',
            summary: '2 of 6 recommended security headers are present or applicable.',
            details: {
              contentSecurityPolicy: { status: 'warning', present: false },
              strictTransportSecurity: { status: 'warning', present: false, applicable: true },
              xContentTypeOptions: { status: 'pass', present: true, expected: 'nosniff' },
              xFrameOptions: { status: 'warning', present: false, expected: 'DENY or SAMEORIGIN' },
              referrerPolicy: { status: 'pass', present: true },
              permissionsPolicy: { status: 'warning', present: false }
            }
          }
        },
        issues: [{
          code: 'MISSING_CANONICAL',
          severity: 'warning',
          category: 'seo',
          message: 'The page does not define a canonical URL.',
          suggestion: 'Add one canonical link element that identifies the preferred URL.'
        }]
      }
    })

    expect(validateSuccessEnvelope(envelope)).toEqual({
      valid: true,
      data: envelope.data,
      requestId: 'render-request-id'
    })
  })

  it('rejects malformed scores', () => {
    for (const score of ['95', -1, 101, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectInvalid(validEnvelope({ data: { score } }))
    }
  })

  it('rejects missing or invalid grades', () => {
    expectInvalid(validEnvelope({ data: { grade: undefined } }))
    expectInvalid(validEnvelope({ data: { grade: 'Z' } }))
  })

  it('rejects missing or malformed checks', () => {
    expectInvalid(validEnvelope({ data: { checks: undefined } }))
    expectInvalid(validEnvelope({ data: { checks: [] } }))

    const missingOne = validEnvelope()
    delete missingOne.data.checks.title
    expectInvalid(missingOne)

    const malformedDetails = validEnvelope()
    malformedDetails.data.checks.securityHeaders.details = {
      unsafeNestedArray: { values: [{ bad: true }] }
    }
    expectInvalid(malformedDetails)
  })

  it('rejects missing or malformed issues', () => {
    expectInvalid(validEnvelope({ data: { issues: undefined } }))
    expectInvalid(validEnvelope({ data: { issues: { 0: {} } } }))
  })

  it('rejects malformed scoring breakdown', () => {
    expectInvalid(validEnvelope({ data: { scoring: { scoringPolicyVersion: '1.0', earnedPoints: 95, possiblePoints: 100, excludedPoints: 0, breakdown: {} } } }))

    const malformed = validEnvelope()
    malformed.data.scoring.breakdown.title.earnedPoints = '10'
    expectInvalid(malformed)
  })

  it('rejects missing URLs, dates, metadata, and unknown audit statuses', () => {
    expectInvalid(validEnvelope({ data: { finalUrl: '' } }))
    expectInvalid(validEnvelope({ data: { requestedUrl: '' } }))
    expectInvalid(validEnvelope({ data: { auditedAt: '' } }))
    expectInvalid(validEnvelope({ data: { auditedAt: 'not a date' } }))
    expectInvalid(validEnvelope({ data: { httpStatus: '200' } }))
    expectInvalid(validEnvelope({ data: { responseTimeMs: -1 } }))
    expectInvalid(validEnvelope({ data: { responseSizeBytes: Number.NaN } }))
    expectInvalid(validEnvelope({ data: { cached: 'false' } }))
    expectInvalid(validEnvelope({ data: { auditStatus: 'partial' } }))
  })
})

describe('public UI retry-after normalisation', () => {
  it('prefers valid positive response headers and rounds fractional values up', () => {
    expect(getRetryAfterSeconds({ retryAfter: '12' }, null)).toBe(12)
    expect(getRetryAfterSeconds({ retryAfter: '1.2' }, null)).toBe(2)
    expect(getRetryAfterSeconds({ retryAfter: '3' }, { error: { details: [{ retryAfterSeconds: 10 }] } })).toBe(3)
  })

  it('falls back to safe details and rejects unusable values', () => {
    const body = { error: { details: [{ retryAfterSeconds: 9 }] } }

    expect(getRetryAfterSeconds({ retryAfter: 'soon' }, body)).toBe(9)
    expect(getRetryAfterSeconds({ retryAfter: '-1' }, null)).toBe(0)
    expect(getRetryAfterSeconds({ retryAfter: '0' }, null)).toBe(0)
    expect(getRetryAfterSeconds({ retryAfter: 'Infinity' }, body)).toBe(9)
  })

  it('caps excessive retry values to one hour', () => {
    expect(getRetryAfterSeconds({ retryAfter: String(maxRetryAfterSeconds + 10) }, null)).toBe(maxRetryAfterSeconds)
  })
})

describe('public UI theme helpers', () => {
  it('falls back invalid themes to system without persisting defaults in the helper', () => {
    expect(normaliseThemeMode('light')).toBe('light')
    expect(normaliseThemeMode('dark')).toBe('dark')
    expect(normaliseThemeMode('system')).toBe('system')
    expect(normaliseThemeMode('neon')).toBe('system')
    expect(normaliseThemeMode(null)).toBe('system')
  })
})
