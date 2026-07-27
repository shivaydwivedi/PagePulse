import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'

const baseConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  REQUEST_BODY_LIMIT: '16kb',
  AUDIT_TIMEOUT_MS: 8000,
  AUDIT_MAX_REDIRECTS: 5,
  AUDIT_MAX_RESPONSE_BYTES: 1048576,
  AUDIT_USER_AGENT: 'PagePulseBot/1.0'
}

function createTestApp(config = baseConfig) {
  return createApp({
    config,
    auditHttpClient: {
      async fetchAuditTarget() {
        return {
          requestedUrl: 'https://example.com/',
          finalUrl: 'https://example.com/',
          statusCode: 200,
          headers: { 'content-type': 'text/html' },
          contentType: 'text/html',
          responseSizeBytes: 96,
          responseTimeMs: 12,
          redirectCount: 0,
          auditedAt: '2026-07-27T00:00:00.000Z',
          body: Buffer.from('<!doctype html><html lang="en"><head><title>Example Domain</title></head><body><h1>Example</h1></body></html>')
        }
      }
    }
  })
}

function expectCommonSecurityHeaders(response) {
  expect(response.headers['content-security-policy']).toContain("default-src 'self'")
  expect(response.headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline'")
  expect(response.headers['content-security-policy']).toContain("style-src 'self'")
  expect(response.headers['content-security-policy']).toContain("img-src 'self'")
  expect(response.headers['content-security-policy']).toContain("connect-src 'self'")
  expect(response.headers['x-content-type-options']).toBe('nosniff')
  expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(response.headers['permissions-policy']).toContain('geolocation=()')
  expect(response.headers['x-frame-options']).toBe('DENY')
  expect(response.headers['x-powered-by']).toBeUndefined()
}

describe('application security headers', () => {
  it('applies browser security headers to UI, API, health, not-found, and error responses', async () => {
    const app = createTestApp()
    const responses = [
      await request(app).get('/').expect(200),
      await request(app).get('/healthz').expect(200),
      await request(app).get('/missing').expect(404),
      await request(app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200),
      await request(app).post('/api/v1/audits').set('Content-Type', 'application/json').send('{"url":').expect(400)
    ]

    for (const response of responses) {
      expectCommonSecurityHeaders(response)
      expect(response.headers['strict-transport-security']).toBeUndefined()
    }
  })

  it('sets conservative HSTS only in production mode', async () => {
    const response = await request(createTestApp({ ...baseConfig, NODE_ENV: 'production' }))
      .get('/healthz')
      .expect(200)

    expectCommonSecurityHeaders(response)
    expect(response.headers['strict-transport-security']).toBe('max-age=2592000')
  })

  it('serves the favicon asset and legacy favicon path with security headers', async () => {
    const app = createTestApp()

    const favicon = await request(app)
      .get('/favicon.svg')
      .expect(200)

    expect(favicon.headers['content-type']).toContain('image/svg+xml')
    expect(favicon.body.toString('utf8')).toContain('<svg')
    expectCommonSecurityHeaders(favicon)

    const legacyFavicon = await request(app)
      .get('/favicon.ico')
      .expect(200)

    expect(legacyFavicon.headers['content-type']).toContain('image/svg+xml')
    expect(legacyFavicon.body.toString('utf8')).toContain('<svg')
    expectCommonSecurityHeaders(legacyFavicon)
  })
})
