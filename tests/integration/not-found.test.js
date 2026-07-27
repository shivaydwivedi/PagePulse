import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'

const testConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  REQUEST_BODY_LIMIT: '16kb'
}

describe('unknown routes', () => {
  it('return a structured not-found error envelope', async () => {
    const app = createApp({ config: testConfig })

    const response = await request(app)
      .get('/missing')
      .expect(404)

    expect(response.headers['x-request-id']).toEqual(expect.any(String))
    expect(response.body).toEqual({
      success: false,
      requestId: response.headers['x-request-id'],
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
        details: []
      }
    })
  })
})
