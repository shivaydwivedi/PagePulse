import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'

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

function createTestApp() {
  return createApp({
    config: testConfig,
    auditHttpClient: {
      async fetchAuditTarget(normalisedUrl) {
        return {
          requestedUrl: normalisedUrl,
          finalUrl: normalisedUrl,
          statusCode: 200,
          headers: {
            'content-type': 'text/html',
            'set-cookie': 'session=secret',
            'x-secret-debug': 'raw-upstream-value'
          },
          contentType: 'text/html',
          responseSizeBytes: 12,
          responseTimeMs: 7,
          redirectCount: 0,
          auditedAt: '2026-07-27T00:00:00.000Z',
          body: Buffer.from(`
            <html lang="en">
              <head>
                <title>Example Domain Page</title>
                <meta name="description" content="This is a useful page summary written for deterministic route tests.">
                <link rel="canonical" href="https://example.com/path?q=1">
                <meta name="viewport" content="width=device-width, initial-scale=1">
              </head>
              <body><h1>Example Domain</h1></body>
            </html>
          `)
        }
      }
    }
  })
}

describe('POST /api/v1/audits', () => {
  it('returns a transport result for a valid URL', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/audits')
      .send({ url: 'https://EXAMPLE.com:443/path?q=1#section' })
      .expect(200)

    expect(response.headers['x-request-id']).toEqual(expect.any(String))
    expect(response.headers['x-cache']).toBe('MISS')
    expect(response.body).toEqual({
      success: true,
      requestId: response.headers['x-request-id'],
      data: {
        requestedUrl: 'https://example.com/path?q=1',
        finalUrl: 'https://example.com/path?q=1',
        httpStatus: 200,
        redirectCount: 0,
        responseTimeMs: 7,
        contentType: 'text/html',
        responseSizeBytes: 12,
        auditedAt: '2026-07-27T00:00:00.000Z',
        auditStatus: 'complete',
        cached: false,
        score: 91,
        grade: 'A',
        scoring: {
          scoringPolicyVersion: '1.0',
          earnedPoints: 84,
          possiblePoints: 92,
          excludedPoints: 8,
          breakdown: expect.any(Object)
        },
        page: {
          title: 'Example Domain Page',
          metaDescription: 'This is a useful page summary written for deterministic route tests.',
          canonicalUrl: 'https://example.com/path?q=1',
          language: 'en',
          headingCount: 1,
          imageCount: 0,
          linkCount: 0
        },
        checks: expect.any(Object),
        issues: expect.any(Array)
      }
    })
    expect(JSON.stringify(response.body)).not.toContain('<h1>Example Domain</h1>')
    expect(JSON.stringify(response.body)).not.toContain('session=secret')
    expect(JSON.stringify(response.body)).not.toContain('raw-upstream-value')
    expect(Object.keys(response.body.data.scoring.breakdown)).toEqual([
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
    expect(response.headers['set-cookie']).toBeUndefined()
  })

  it('propagates a valid incoming request ID', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/audits')
      .set('X-Request-ID', 'phase2-request-id')
      .send({ url: 'https://example.com' })
      .expect(200)

    expect(response.headers['x-request-id']).toBe('phase2-request-id')
    expect(response.body.requestId).toBe('phase2-request-id')
  })

  it('returns structured validation errors with request IDs for invalid request shapes', async () => {
    const cases = [
      { name: 'missing body', request: (agent) => agent.post('/api/v1/audits') },
      { name: 'empty object', request: (agent) => agent.post('/api/v1/audits').send({}) },
      { name: 'null url', request: (agent) => agent.post('/api/v1/audits').send({ url: null }) },
      { name: 'number url', request: (agent) => agent.post('/api/v1/audits').send({ url: 123 }) },
      { name: 'array url', request: (agent) => agent.post('/api/v1/audits').send({ url: ['https://example.com'] }) },
      { name: 'object url', request: (agent) => agent.post('/api/v1/audits').send({ url: { href: 'https://example.com' } }) },
      { name: 'empty string', request: (agent) => agent.post('/api/v1/audits').send({ url: '' }) },
      { name: 'whitespace string', request: (agent) => agent.post('/api/v1/audits').send({ url: '   ' }) },
      { name: 'too long', request: (agent) => agent.post('/api/v1/audits').send({ url: `https://example.com/${'a'.repeat(2048)}` }) },
      { name: 'unknown field', request: (agent) => agent.post('/api/v1/audits').send({ url: 'https://example.com', extra: true }) }
    ]

    for (const testCase of cases) {
      const response = await testCase.request(request(createTestApp()))
        .set('X-Request-ID', `invalid-${testCase.name.replaceAll(' ', '-')}`)
        .expect(400)

      expect(response.headers['x-request-id']).toEqual(response.body.requestId)
      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
      expect(response.body.error.details.length).toBeGreaterThan(0)
    }
  })

  it('returns INVALID_URL for malformed URLs', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/audits')
      .send({ url: 'not a url' })
      .expect(400)

    expect(response.body.error).toEqual({
      code: 'INVALID_URL',
      message: 'The provided URL is not valid.',
      details: [{ field: 'url' }]
    })
  })

  it('rejects unsupported protocols', async () => {
    for (const url of [
      'ftp://example.com',
      'file:///tmp/example.html',
      'data:text/plain,hello',
      'javascript:alert(1)'
    ]) {
      const response = await request(createTestApp())
        .post('/api/v1/audits')
        .send({ url })
        .expect(400)

      expect(response.body.error.code).toBe('UNSUPPORTED_PROTOCOL')
    }
  })

  it('rejects embedded credentials', async () => {
    for (const url of ['https://user@example.com', 'https://user:password@example.com']) {
      const response = await request(createTestApp())
        .post('/api/v1/audits')
        .send({ url })
        .expect(400)

      expect(response.body.error).toEqual({
        code: 'URL_CREDENTIALS_BLOCKED',
        message: 'URLs containing embedded credentials are not allowed.',
        details: [{ field: 'url' }]
      })
    }
  })

  it('returns structured INVALID_JSON for malformed JSON', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/audits')
      .set('Content-Type', 'application/json')
      .send('{"url":')
      .expect(400)

    expect(response.headers['x-request-id']).toEqual(response.body.requestId)
    expect(response.body.error).toEqual({
      code: 'INVALID_JSON',
      message: 'Request body contains invalid JSON.',
      details: []
    })
  })

  it('rejects non-JSON request content types when a body is supplied', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/audits')
      .set('Content-Type', 'text/plain')
      .send('url=https://example.com')
      .expect(415)

    expect(response.body.error).toEqual({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Request body must use application/json.',
      details: []
    })
  })
})
