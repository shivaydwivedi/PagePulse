import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'

const testConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  REQUEST_BODY_LIMIT: '16kb'
}

describe('GET /healthz', () => {
  it('returns a standard success envelope with request ID header', async () => {
    const app = createApp({ config: testConfig })

    const response = await request(app)
      .get('/healthz')
      .expect(200)

    expect(response.headers['x-request-id']).toEqual(expect.any(String))
    expect(response.body).toEqual({
      success: true,
      requestId: response.headers['x-request-id'],
      data: {
        status: 'ok'
      }
    })
  })

  it('propagates a valid incoming request ID', async () => {
    const app = createApp({ config: testConfig })

    const response = await request(app)
      .get('/healthz')
      .set('X-Request-ID', 'phase1-test-id_123')
      .expect(200)

    expect(response.headers['x-request-id']).toBe('phase1-test-id_123')
    expect(response.body.requestId).toBe('phase1-test-id_123')
  })

  it('replaces malformed or excessive incoming request IDs', async () => {
    const app = createApp({ config: testConfig })
    const malformedRequestId = `${'a'.repeat(81)}!`

    const response = await request(app)
      .get('/healthz')
      .set('X-Request-ID', malformedRequestId)
      .expect(200)

    expect(response.headers['x-request-id']).toEqual(expect.any(String))
    expect(response.headers['x-request-id']).not.toBe(malformedRequestId)
    expect(response.body.requestId).toBe(response.headers['x-request-id'])
  })
})
