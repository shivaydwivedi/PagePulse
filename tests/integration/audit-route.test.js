import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'

const testConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  REQUEST_BODY_LIMIT: '16kb'
}

function createTestApp() {
  return createApp({
    config: testConfig,
    resolver: async () => [{ address: '93.184.216.34', family: 4 }]
  })
}

describe('POST /api/v1/audits', () => {
  it('returns the temporary 501 response for a valid URL', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/audits')
      .send({ url: 'https://EXAMPLE.com:443/path?q=1#section' })
      .expect(501)

    expect(response.headers['x-request-id']).toEqual(expect.any(String))
    expect(response.body).toEqual({
      success: false,
      requestId: response.headers['x-request-id'],
      error: {
        code: 'AUDIT_PROCESSING_NOT_IMPLEMENTED',
        message: 'URL validation succeeded, but audit processing is not implemented yet.',
        details: [
          {
            field: 'url',
            normalisedUrl: 'https://example.com/path?q=1'
          }
        ]
      }
    })
  })

  it('propagates a valid incoming request ID', async () => {
    const response = await request(createTestApp())
      .post('/api/v1/audits')
      .set('X-Request-ID', 'phase2-request-id')
      .send({ url: 'https://example.com' })
      .expect(501)

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
