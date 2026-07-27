import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.js'
import { AppError } from '../../src/utils/errors.js'

const testConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  REQUEST_BODY_LIMIT: '16kb',
  AUDIT_TIMEOUT_MS: 8000,
  AUDIT_MAX_REDIRECTS: 5,
  AUDIT_MAX_RESPONSE_BYTES: 1048576,
  AUDIT_USER_AGENT: 'PagePulseBot/1.0'
}

function createTransportResult(overrides = {}) {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: overrides.finalUrl ?? 'https://example.com/',
    statusCode: overrides.statusCode ?? 200,
    headers: overrides.headers ?? {
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin',
      'permissions-policy': 'geolocation=()',
      'set-cookie': 'session=secret',
      'x-secret-debug': 'hidden'
    },
    contentType: 'text/html; charset=utf-8',
    responseSizeBytes: overrides.responseSizeBytes ?? 100,
    responseTimeMs: 7,
    redirectCount: 0,
    auditedAt: '2026-07-27T00:00:00.000Z',
    body: Buffer.from(overrides.html ?? `
      <html lang="en">
        <head>
          <title>Healthy Example Page</title>
          <meta name="description" content="This is a useful page summary written for deterministic integration tests.">
          <link rel="canonical" href="https://example.com/">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          <h1>Healthy Example</h1>
          <img src="/logo.png" alt="Logo">
          <a href="/about">About</a>
        </body>
      </html>
    `)
  }
}

function createTestApp(transportResultOrError) {
  return createApp({
    config: testConfig,
    auditHttpClient: {
      fetchAuditTarget: vi.fn(async () => {
        if (transportResultOrError instanceof Error) {
          throw transportResultOrError
        }

        return transportResultOrError ?? createTransportResult()
      })
    }
  })
}

describe('POST /api/v1/audits analysis response', () => {
  it('returns page metadata, checks, issues, score, grade, request IDs, and no raw HTML', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/audits')
      .set('X-Request-ID', 'analysis-request-id')
      .send({ url: 'https://example.com' })
      .expect(200)

    expect(response.headers['x-request-id']).toBe('analysis-request-id')
    expect(response.body.requestId).toBe('analysis-request-id')
    expect(response.body.data).toMatchObject({
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      httpStatus: 200,
      auditStatus: 'complete',
      score: 100,
      grade: 'A',
      scoring: {
        scoringPolicyVersion: '1.0',
        earnedPoints: 100,
        possiblePoints: 100,
        excludedPoints: 0,
        breakdown: expect.any(Object)
      },
      page: {
        title: 'Healthy Example Page',
        headingCount: 1,
        imageCount: 1,
        linkCount: 1
      },
      checks: expect.any(Object),
      issues: []
    })
    expect(Object.keys(response.body.data.checks)).toEqual([
      'https',
      'title',
      'metaDescription',
      'canonical',
      'viewport',
      'htmlLang',
      'headings',
      'images',
      'links',
      'securityHeaders'
    ])
    expect(JSON.stringify(response.body)).not.toContain('<h1>')
    expect(JSON.stringify(response.body)).not.toContain('session=secret')
    expect(Number.isInteger(response.body.data.score)).toBe(true)
    expect(['A', 'B', 'C', 'D', 'F']).toContain(response.body.data.grade)
    expect(response.body.data.recommendations).toBeUndefined()
  })

  it('returns deterministic issues for malformed HTML, missing title, missing H1, missing alt, missing security headers, and upstream status', async () => {
    const response = await request(createTestApp(createTransportResult({
      statusCode: 404,
      headers: {},
      html: '<html><head><title> </title></head><body><h2>Section<img src="/missing.png"><a href="">Empty</a>'
    })))
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(200)

    expect(response.body.data.httpStatus).toBe(404)
    expect(response.body.data.auditStatus).toBe('complete')
    expect(response.body.data.score).toBe(49)
    expect(response.body.data.grade).toBe('F')
    expect(response.body.data.issues.map((item) => item.code)).toEqual([
      'UPSTREAM_HTTP_STATUS',
      'MISSING_TITLE',
      'MISSING_META_DESCRIPTION',
      'MISSING_CANONICAL',
      'MISSING_VIEWPORT',
      'MISSING_HTML_LANG',
      'MISSING_H1',
      'IMAGE_MISSING_ALT',
      'EMPTY_LINK_HREF',
      'MISSING_CONTENT_SECURITY_POLICY',
      'MISSING_STRICT_TRANSPORT_SECURITY',
      'INVALID_X_CONTENT_TYPE_OPTIONS',
      'MISSING_X_FRAME_OPTIONS',
      'MISSING_REFERRER_POLICY',
      'MISSING_PERMISSIONS_POLICY'
    ])
  })

  it('scores no-image normalisation, title failure, and upstream status issue independence', async () => {
    const noImage = await request(createTestApp(createTransportResult({
      html: `
        <html lang="en">
          <head>
            <title>Healthy Example Page</title>
            <meta name="description" content="This is a useful page summary written for deterministic integration tests.">
            <link rel="canonical" href="https://example.com/">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body><h1>Healthy Example</h1><a href="/about">About</a></body>
        </html>
      `
    })))
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(200)

    expect(noImage.body.data.score).toBe(100)
    expect(noImage.body.data.grade).toBe('A')
    expect(noImage.body.data.scoring).toMatchObject({
      earnedPoints: 92,
      possiblePoints: 92,
      excludedPoints: 8
    })
    expect(noImage.body.data.scoring.breakdown.images).toMatchObject({
      status: 'not_applicable',
      applicable: false,
      earnedPoints: 0
    })

    const titleFailure = await request(createTestApp(createTransportResult({
      html: `
        <html lang="en">
          <head>
            <title> </title>
            <meta name="description" content="This is a useful page summary written for deterministic integration tests.">
            <link rel="canonical" href="https://example.com/">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body><h1>Healthy Example</h1><img src="/logo.png" alt="Logo"><a href="/about">About</a></body>
        </html>
      `
    })))
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(200)

    expect(titleFailure.body.data.score).toBe(88)
    expect(titleFailure.body.data.grade).toBe('B')
    expect(titleFailure.body.data.issues.map((item) => item.code)).toContain('MISSING_TITLE')

    const upstream404 = await request(createTestApp(createTransportResult({ statusCode: 404 })))
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(200)

    expect(upstream404.body.data.score).toBe(100)
    expect(upstream404.body.data.issues.map((item) => item.code)).toContain('UPSTREAM_HTTP_STATUS')
  })

  it('preserves existing transport error responses', async () => {
    for (const { error, status, code } of [
      {
        error: new AppError({
          code: 'BLOCKED_TARGET',
          message: 'The requested URL resolves to a destination that is not allowed.',
          statusCode: 400
        }),
        status: 400,
        code: 'BLOCKED_TARGET'
      },
      {
        error: new AppError({
          code: 'DNS_LOOKUP_FAILED',
          message: 'The destination hostname could not be resolved.',
          statusCode: 502
        }),
        status: 502,
        code: 'DNS_LOOKUP_FAILED'
      },
      {
        error: new AppError({
          code: 'UPSTREAM_TIMEOUT',
          message: 'The destination did not respond within the allowed time.',
          statusCode: 504
        }),
        status: 504,
        code: 'UPSTREAM_TIMEOUT'
      },
      {
        error: new AppError({
          code: 'RESPONSE_TOO_LARGE',
          message: 'The destination response exceeded the allowed size.',
          statusCode: 502
        }),
        status: 502,
        code: 'RESPONSE_TOO_LARGE'
      },
      {
        error: new AppError({
          code: 'UPSTREAM_UNSUPPORTED_CONTENT',
          message: 'The destination did not return a supported HTML content type.',
          statusCode: 422
        }),
        status: 422,
        code: 'UPSTREAM_UNSUPPORTED_CONTENT'
      }
    ]) {
      const response = await request(createTestApp(error))
        .post('/api/v1/audits')
        .send({ url: 'https://example.com' })
        .expect(status)

      expect(response.body.error.code).toBe(code)
    }
  })

  it('handles unexpected HTML-analysis failures through central error middleware', async () => {
    const analyserError = new Error('raw analyser exploded with <h1>secret html</h1>')
    const app = createApp({
      config: testConfig,
      auditHttpClient: {
        async fetchAuditTarget() {
          return createTransportResult({
            html: '<html><body><h1>transport body secret</h1></body></html>'
          })
        }
      },
      htmlAnalysisService: {
        analyse() {
          throw analyserError
        }
      }
    })

    const response = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'analysis-error-id')
      .send({ url: 'https://example.com' })
      .expect(500)

    expect(response.headers['x-request-id']).toBe('analysis-error-id')
    expect(response.body.requestId).toBe('analysis-error-id')
    expect(response.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: []
    })
    expect(JSON.stringify(response.body)).not.toContain('raw analyser exploded')
    expect(JSON.stringify(response.body)).not.toContain('stack')
    expect(JSON.stringify(response.body)).not.toContain('transport body secret')
    expect(JSON.stringify(response.body)).not.toContain('<h1>')
    expect(AppError.from(analyserError).cause).toBe(analyserError)
  })

  it('handles unexpected scorer failures through central error middleware', async () => {
    const scorerError = new Error('raw scorer weights exploded with <h1>secret html</h1>')
    const app = createApp({
      config: testConfig,
      auditHttpClient: {
        async fetchAuditTarget() {
          return createTransportResult({
            html: '<html><body><h1>transport body secret</h1></body></html>'
          })
        }
      },
      auditScorer: {
        score() {
          throw scorerError
        }
      }
    })

    const response = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'scoring-error-id')
      .send({ url: 'https://example.com' })
      .expect(500)

    expect(response.headers['x-request-id']).toBe('scoring-error-id')
    expect(response.body.requestId).toBe('scoring-error-id')
    expect(response.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: []
    })
    expect(JSON.stringify(response.body)).not.toContain('raw scorer weights')
    expect(JSON.stringify(response.body)).not.toContain('stack')
    expect(JSON.stringify(response.body)).not.toContain('transport body secret')
    expect(JSON.stringify(response.body)).not.toContain('<h1>')
    expect(AppError.from(scorerError).cause).toBe(scorerError)
  })

  it('preserves malformed JSON, unsupported media type, health, and unknown route behaviour', async () => {
    await request(createTestApp())
      .post('/api/v1/audits')
      .set('Content-Type', 'application/json')
      .send('{"url":')
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe('INVALID_JSON')
      })

    await request(createTestApp())
      .post('/api/v1/audits')
      .set('Content-Type', 'text/plain')
      .send('url=https://example.com')
      .expect(415)
      .expect((response) => {
        expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
      })

    await request(createTestApp())
      .get('/healthz')
      .expect(200)

    await request(createTestApp())
      .get('/unknown')
      .expect(404)
      .expect((response) => {
        expect(response.body.error.code).toBe('NOT_FOUND')
      })
  })
})
