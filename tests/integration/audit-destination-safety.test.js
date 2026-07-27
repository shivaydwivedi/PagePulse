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

function createTestApp(resolver, requestFn = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'text/html' },
  body: [Buffer.from('<html></html>')]
})) {
  return createApp({
    config: testConfig,
    resolver,
    requestFn,
    dispatcherFactory: (destination) => ({
      dispatcher: { destination },
      close: async () => {}
    })
  })
}

describe('audit destination safety integration', () => {
  it('lets public hostnames with fake public DNS reach the transport boundary', async () => {
    const response = await request(createTestApp(async () => [{ address: '93.184.216.34', family: 4 }]))
      .post('/api/v1/audits')
      .set('X-Request-ID', 'safe-destination-id')
      .send({ url: 'https://EXAMPLE.com:443/path?q=1#section' })
      .expect(200)

    expect(response.headers['x-request-id']).toBe('safe-destination-id')
    expect(response.body.data).toMatchObject({
      requestedUrl: 'https://example.com/path?q=1',
      finalUrl: 'https://example.com/path?q=1',
      auditStatus: 'analysis_complete'
    })
  })

  it('blocks localhost and literal private IP destinations', async () => {
    const app = createTestApp(async () => [{ address: '93.184.216.34', family: 4 }])

    for (const url of ['https://localhost', 'http://10.0.0.1', 'http://[fd00::1]']) {
      const response = await request(app)
        .post('/api/v1/audits')
        .set('X-Request-ID', 'blocked-literal-id')
        .send({ url })
        .expect(400)

      expect(response.headers['x-request-id']).toBe('blocked-literal-id')
      expect(response.body.error.code).toBe('BLOCKED_TARGET')
    }
  })

  it('blocks numeric host forms canonicalised to unsafe IPv4 addresses', async () => {
    const app = createTestApp(async () => [{ address: '93.184.216.34', family: 4 }])

    for (const url of [
      'http://2130706433',
      'http://017700000001',
      'http://0x7f000001',
      'http://127.1',
      'http://127.0.1',
      'http://0',
      'http://4294967295'
    ]) {
      const response = await request(app)
        .post('/api/v1/audits')
        .send({ url })
        .expect(400)

      expect(response.body.error.code).toBe('BLOCKED_TARGET')
    }
  })

  it('rejects out-of-range numeric hosts as invalid URLs', async () => {
    const response = await request(createTestApp(async () => [{ address: '93.184.216.34', family: 4 }]))
      .post('/api/v1/audits')
      .send({ url: 'http://4294967296' })
      .expect(400)

    expect(response.body.error.code).toBe('INVALID_URL')
  })

  it('blocks public hostnames resolving to private or mixed destinations', async () => {
    const cases = [
      [{ address: '192.168.1.1', family: 4 }],
      [{ address: 'fd00::1', family: 6 }],
      [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 }
      ]
    ]

    for (const resolvedAddresses of cases) {
      const response = await request(createTestApp(async () => resolvedAddresses))
        .post('/api/v1/audits')
        .send({ url: 'https://example.com' })
        .expect(400)

      expect(response.body.error.code).toBe('BLOCKED_TARGET')
    }
  })

  it('maps DNS failures to structured DNS_LOOKUP_FAILED responses', async () => {
    const response = await request(createTestApp(async () => {
      throw new Error('fake DNS failure')
    }))
      .post('/api/v1/audits')
      .set('X-Request-ID', 'dns-failure-id')
      .send({ url: 'https://missing.example' })
      .expect(502)

    expect(response.headers['x-request-id']).toBe('dns-failure-id')
    expect(response.body.error.code).toBe('DNS_LOOKUP_FAILED')
  })

  it('blocks resolver family and address mismatches', async () => {
    const cases = [
      [{ address: '93.184.216.34', family: 6 }],
      [{ address: '2001:4860:4860::8888', family: 4 }]
    ]

    for (const resolvedAddresses of cases) {
      const response = await request(createTestApp(async () => resolvedAddresses))
        .post('/api/v1/audits')
        .send({ url: 'https://example.com' })
        .expect(400)

      expect(response.body.error.code).toBe('BLOCKED_TARGET')
    }
  })

  it('preserves malformed JSON and unsupported media-type behaviour', async () => {
    await request(createTestApp(async () => [{ address: '93.184.216.34', family: 4 }]))
      .post('/api/v1/audits')
      .set('Content-Type', 'application/json')
      .send('{"url":')
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe('INVALID_JSON')
      })

    await request(createTestApp(async () => [{ address: '93.184.216.34', family: 4 }]))
      .post('/api/v1/audits')
      .set('Content-Type', 'text/plain')
      .send('url=https://example.com')
      .expect(415)
      .expect((response) => {
        expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
      })
  })
})
