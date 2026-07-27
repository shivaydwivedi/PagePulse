import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../../src/app.js'
import { AppError } from '../../src/utils/errors.js'

const baseConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  REQUEST_BODY_LIMIT: '16kb',
  AUDIT_TIMEOUT_MS: 8000,
  AUDIT_MAX_REDIRECTS: 5,
  AUDIT_MAX_RESPONSE_BYTES: 1048576,
  AUDIT_USER_AGENT: 'PagePulseBot/1.0',
  AUDIT_CACHE_ENABLED: true,
  AUDIT_CACHE_TTL_MS: 300000,
  AUDIT_CACHE_MAX_ENTRIES: 500,
  AUDIT_MAX_CONCURRENT: 5,
  AUDIT_MAX_QUEUE_SIZE: 50,
  AUDIT_QUEUE_TIMEOUT_MS: 2000,
  AUDIT_RATE_LIMIT_ENABLED: true,
  AUDIT_RATE_LIMIT_WINDOW_MS: 1000,
  AUDIT_RATE_LIMIT_MAX_REQUESTS: 3,
  AUDIT_RATE_LIMIT_MAX_CLIENTS: 10000,
  TRUST_PROXY: false
}

function createTransportResult(normalisedUrl) {
  return {
    requestedUrl: normalisedUrl,
    finalUrl: normalisedUrl,
    statusCode: 200,
    headers: {
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin',
      'permissions-policy': 'geolocation=()',
      'set-cookie': 'session=secret'
    },
    contentType: 'text/html',
    responseSizeBytes: 100,
    responseTimeMs: 9,
    redirectCount: 0,
    auditedAt: '2026-07-27T00:00:00.000Z',
    body: Buffer.from(`
      <html lang="en">
        <head>
          <title>Healthy Example Page</title>
          <meta name="description" content="This is a useful page summary written for deterministic rate tests.">
          <link rel="canonical" href="${normalisedUrl}">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body><h1>Healthy Example</h1><img src="/logo.png" alt="Logo"><a href="/about">About</a></body>
      </html>
    `)
  }
}

function createTestApp(options = {}) {
  const fetchAuditTarget = options.fetchAuditTarget ?? vi.fn(async (normalisedUrl) => createTransportResult(normalisedUrl))
  const cache = options.auditCache ?? undefined
  const semaphore = options.auditSemaphore ?? undefined

  return {
    app: createApp({
      config: { ...baseConfig, ...options.config },
      auditCache: cache,
      auditSemaphore: semaphore,
      auditRateLimiter: options.auditRateLimiter,
      auditHttpClient: { fetchAuditTarget },
      htmlAnalysisService: options.htmlAnalysisService,
      auditScorer: options.auditScorer,
      rateLimitClock: options.rateLimitClock
    }),
    fetchAuditTarget,
    cache,
    semaphore
  }
}

function createAuditDependencySpies() {
  return {
    auditCache: {
      get: vi.fn(),
      set: vi.fn()
    },
    auditSemaphore: {
      acquire: vi.fn(async () => vi.fn())
    },
    fetchAuditTarget: vi.fn(async (normalisedUrl) => createTransportResult(normalisedUrl)),
    htmlAnalysisService: {
      analyse: vi.fn()
    },
    auditScorer: {
      score: vi.fn()
    }
  }
}

function expectNoAuditWork({ auditCache, auditSemaphore, fetchAuditTarget, htmlAnalysisService, auditScorer }) {
  expect(auditCache.get).not.toHaveBeenCalled()
  expect(auditCache.set).not.toHaveBeenCalled()
  expect(auditSemaphore.acquire).not.toHaveBeenCalled()
  expect(fetchAuditTarget).not.toHaveBeenCalled()
  expect(htmlAnalysisService.analyse).not.toHaveBeenCalled()
  expect(auditScorer.score).not.toHaveBeenCalled()
}

function expectRateHeaders(response, limit, remaining) {
  expect(response.headers['ratelimit-limit']).toBe(String(limit))
  expect(response.headers['ratelimit-remaining']).toBe(String(remaining))
  expect(response.headers['ratelimit-reset']).toMatch(/^\d+$/)
}

function expectAllowedErrorHeaders(response, limit, remaining) {
  expectRateHeaders(response, limit, remaining)
  expect(response.headers['retry-after']).toBeUndefined()
  expect(response.headers['x-request-id']).toBeDefined()
}

describe('audit endpoint rate limiting', () => {
  it('allows first through last request and rejects the next one with stable 429 contract', async () => {
    const { app, fetchAuditTarget } = createTestApp({
      config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 3, AUDIT_CACHE_ENABLED: false }
    })

    const first = await request(app).post('/api/v1/audits').send({ url: 'https://example.com/1' }).expect(200)
    const second = await request(app).post('/api/v1/audits').send({ url: 'https://example.com/2' }).expect(200)
    const third = await request(app).post('/api/v1/audits').send({ url: 'https://example.com/3' }).expect(200)
    const fourth = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'rate-limit-id')
      .send({ url: 'https://example.com/4' })
      .expect(429)

    expectRateHeaders(first, 3, 2)
    expectRateHeaders(second, 3, 1)
    expectRateHeaders(third, 3, 0)
    expectRateHeaders(fourth, 3, 0)
    expect(fourth.headers['retry-after']).toMatch(/^[1-9]\d*$/)
    expect(fourth.headers['x-request-id']).toBe('rate-limit-id')
    expect(fourth.headers['x-cache']).toBeUndefined()
    expect(fourth.body).toEqual({
      success: false,
      requestId: 'rate-limit-id',
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many audit requests. Please try again later.',
        details: [{ retryAfterSeconds: Number(fourth.headers['retry-after']) }]
      }
    })
    expect(JSON.stringify(fourth.body)).not.toContain('127.0.0.1')
    expect(fetchAuditTarget).toHaveBeenCalledTimes(3)
  })

  it('starts a fresh fixed window exactly at reset and keeps clients independent', async () => {
    let now = 0
    const { app } = createTestApp({
      config: { TRUST_PROXY: true, AUDIT_RATE_LIMIT_MAX_REQUESTS: 1, AUDIT_CACHE_ENABLED: false },
      rateLimitClock: () => now
    })

    await request(app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '198.51.100.10')
      .send({ url: 'https://example.com/a' })
      .expect(200)
    await request(app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '198.51.100.10')
      .send({ url: 'https://example.com/a2' })
      .expect(429)
    await request(app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ url: 'https://example.com/b' })
      .expect(200)

    now = 1000
    await request(app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '198.51.100.10')
      .send({ url: 'https://example.com/a3' })
      .expect(200)
    await request(app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ url: 'https://example.com/b2' })
      .expect(200)
  })

  it('rate limits before cache lookup and semaphore acquisition while cache hits still consume quota', async () => {
    const auditCache = {
      get: vi.fn(() => undefined),
      set: vi.fn()
    }
    const auditSemaphore = {
      acquire: vi.fn(async () => vi.fn())
    }
    const { app, fetchAuditTarget } = createTestApp({
      config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 1 },
      auditCache,
      auditSemaphore
    })

    await request(app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    const rejected = await request(app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(429)

    expect(rejected.headers['x-cache']).toBeUndefined()
    expect(auditCache.get).toHaveBeenCalledTimes(2)
    expect(auditSemaphore.acquire).toHaveBeenCalledTimes(1)
    expect(fetchAuditTarget).toHaveBeenCalledTimes(1)

    const cached = createTestApp({ config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 2 } })
    const fresh = await request(cached.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    const hit = await request(cached.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    const overLimit = await request(cached.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(429)

    expect(fresh.headers['x-cache']).toBe('MISS')
    expect(hit.headers['x-cache']).toBe('HIT')
    expect(overLimit.headers['x-cache']).toBeUndefined()
    expect(cached.fetchAuditTarget).toHaveBeenCalledTimes(1)
  })

  it('keeps rate-limit and capacity errors distinct and rate-limits before queueing', async () => {
    const rateLimited = createTestApp({
      config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 1 },
      auditSemaphore: {
        acquire: vi.fn(async () => vi.fn())
      }
    })

    await request(rateLimited.app).post('/api/v1/audits').send({ url: 'https://example.com/a' }).expect(200)
    await request(rateLimited.app).post('/api/v1/audits').send({ url: 'https://example.com/b' }).expect(429)
    expect(rateLimited.semaphore.acquire).toHaveBeenCalledTimes(1)

    const capacity = createTestApp({
      config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 5 },
      auditSemaphore: {
        acquire: vi.fn(async () => {
          throw new AppError({
            code: 'AUDIT_CAPACITY_EXCEEDED',
            message: 'PagePulse is currently processing the maximum number of audits.',
            statusCode: 503,
            details: [{ reason: 'queue_full' }]
          })
        })
      }
    })
    const response = await request(capacity.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(503)

    expect(response.body.error.code).toBe('AUDIT_CAPACITY_EXCEEDED')
    expect(response.headers['ratelimit-limit']).toBe('5')
    expect(response.headers['x-cache']).toBeUndefined()
  })

  it('adds rate-limit headers to allowed validation, transport, analyser, and scorer failures', async () => {
    const validation = await request(createTestApp().app)
      .post('/api/v1/audits')
      .send({})
      .expect(400)
    expect(validation.body.error.code).toBe('VALIDATION_ERROR')
    expectAllowedErrorHeaders(validation, 3, 2)

    const transport = await request(createTestApp({
      fetchAuditTarget: vi.fn(async () => {
        throw new AppError({ code: 'BLOCKED_TARGET', message: 'blocked', statusCode: 400 })
      })
    }).app)
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(400)
    expect(transport.body.error.code).toBe('BLOCKED_TARGET')
    expectAllowedErrorHeaders(transport, 3, 2)

    const dns = await request(createTestApp({
      fetchAuditTarget: vi.fn(async () => {
        throw new AppError({ code: 'DNS_LOOKUP_FAILED', message: 'DNS lookup failed.', statusCode: 502 })
      })
    }).app)
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(502)
    expect(dns.body.error.code).toBe('DNS_LOOKUP_FAILED')
    expectAllowedErrorHeaders(dns, 3, 2)

    const timeout = await request(createTestApp({
      fetchAuditTarget: vi.fn(async () => {
        throw new AppError({ code: 'UPSTREAM_TIMEOUT', message: 'Upstream request timed out.', statusCode: 504 })
      })
    }).app)
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(504)
    expect(timeout.body.error.code).toBe('UPSTREAM_TIMEOUT')
    expectAllowedErrorHeaders(timeout, 3, 2)

    const analyser = await request(createTestApp({
      htmlAnalysisService: {
        analyse() {
          throw new Error('raw analyser failure')
        }
      }
    }).app)
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(500)
    expect(analyser.body.error.code).toBe('INTERNAL_ERROR')
    expectAllowedErrorHeaders(analyser, 3, 2)

    const scorer = await request(createTestApp({
      auditScorer: {
        score() {
          throw new Error('raw scorer failure')
        }
      }
    }).app)
      .post('/api/v1/audits')
      .send({ url: 'https://example.com' })
      .expect(500)
    expect(scorer.body.error.code).toBe('INTERNAL_ERROR')
    expectAllowedErrorHeaders(scorer, 3, 2)
  })

  it('counts malformed JSON before parsing and short-circuits over-limit malformed JSON', async () => {
    const dependencies = createAuditDependencySpies()
    const { app } = createTestApp({
      config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 1 },
      ...dependencies
    })

    const malformed = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'malformed-json-id')
      .set('Content-Type', 'application/json')
      .send('{"url":')
      .expect(400)
    const overLimit = await request(app)
      .post('/api/v1/audits')
      .set('Content-Type', 'application/json')
      .send('{"url":')
      .expect(429)

    expect(malformed.body.error.code).toBe('INVALID_JSON')
    expect(malformed.headers['x-request-id']).toBe('malformed-json-id')
    expectRateHeaders(malformed, 1, 0)
    expect(malformed.headers['x-cache']).toBeUndefined()
    expect(overLimit.body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(overLimit.headers['retry-after']).toMatch(/^[1-9]\d*$/)
    expectRateHeaders(overLimit, 1, 0)
    expect(overLimit.headers['x-cache']).toBeUndefined()
    expectNoAuditWork(dependencies)
  })

  it('counts unsupported audit media before content-type rejection and short-circuits when over limit', async () => {
    const dependencies = createAuditDependencySpies()
    const { app } = createTestApp({
      config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 1 },
      ...dependencies
    })

    const unsupported = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'unsupported-media-id')
      .type('text/plain')
      .send('url=https://example.com')
      .expect(415)
    const overLimit = await request(app)
      .post('/api/v1/audits')
      .type('text/plain')
      .send('url=https://example.com')
      .expect(429)

    expect(unsupported.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    expect(unsupported.headers['x-request-id']).toBe('unsupported-media-id')
    expectRateHeaders(unsupported, 1, 0)
    expect(unsupported.headers['x-cache']).toBeUndefined()
    expect(overLimit.body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(overLimit.headers['retry-after']).toMatch(/^[1-9]\d*$/)
    expectRateHeaders(overLimit, 1, 0)
    expect(overLimit.headers['x-cache']).toBeUndefined()
    expectNoAuditWork(dependencies)
  })

  it('counts empty bodies and invalid URLs while skipping audit work until validation succeeds', async () => {
    const emptyBodyDependencies = createAuditDependencySpies()
    const emptyBody = await request(createTestApp({
      ...emptyBodyDependencies
    }).app)
      .post('/api/v1/audits')
      .expect(400)

    expect(emptyBody.body.error.code).toBe('VALIDATION_ERROR')
    expectAllowedErrorHeaders(emptyBody, 3, 2)
    expect(emptyBody.headers['x-cache']).toBeUndefined()
    expectNoAuditWork(emptyBodyDependencies)

    const invalidUrlDependencies = createAuditDependencySpies()
    const { app } = createTestApp({
      config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 2 },
      ...invalidUrlDependencies
    })
    const first = await request(app).post('/api/v1/audits').send({ url: 'not a url' }).expect(400)
    const second = await request(app).post('/api/v1/audits').send({ url: 'not a url either' }).expect(400)
    const third = await request(app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(429)

    expect(first.body.error.code).toBe('INVALID_URL')
    expect(second.body.error.code).toBe('INVALID_URL')
    expectRateHeaders(first, 2, 1)
    expectRateHeaders(second, 2, 0)
    expect(third.body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expectRateHeaders(third, 2, 0)
    expect(third.headers['retry-after']).toMatch(/^[1-9]\d*$/)
    expectNoAuditWork(invalidUrlDependencies)
  })

  it('fails closed when the injected limiter throws without audit work', async () => {
    const fetchAuditTarget = vi.fn(async (normalisedUrl) => createTransportResult(normalisedUrl))
    const auditCache = { get: vi.fn(), set: vi.fn() }
    const auditSemaphore = { acquire: vi.fn() }
    const htmlAnalysisService = { analyse: vi.fn() }
    const auditScorer = { score: vi.fn() }
    const { app } = createTestApp({
      fetchAuditTarget,
      auditCache,
      auditSemaphore,
      htmlAnalysisService,
      auditScorer,
      auditRateLimiter: {
        consume() {
          throw new Error('limiter storage failed for 127.0.0.1')
        }
      }
    })

    const response = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'limiter-failure-id')
      .send({ url: 'https://example.com' })
      .expect(503)

    expect(response.headers['x-request-id']).toBe('limiter-failure-id')
    expect(response.headers['x-cache']).toBeUndefined()
    expect(response.headers['ratelimit-limit']).toBeUndefined()
    expect(response.body.error).toEqual({
      code: 'RATE_LIMITER_UNAVAILABLE',
      message: 'Audit request limiting is temporarily unavailable.',
      details: []
    })
    expect(JSON.stringify(response.body)).not.toContain('127.0.0.1')
    expect(fetchAuditTarget).not.toHaveBeenCalled()
    expect(auditCache.get).not.toHaveBeenCalled()
    expect(auditCache.set).not.toHaveBeenCalled()
    expect(auditSemaphore.acquire).not.toHaveBeenCalled()
    expect(htmlAnalysisService.analyse).not.toHaveBeenCalled()
    expect(auditScorer.score).not.toHaveBeenCalled()
  })

  it('fails closed for malformed limiter decisions before headers or audit work', async () => {
    const dependencies = createAuditDependencySpies()
    const { app } = createTestApp({
      ...dependencies,
      auditRateLimiter: {
        consume: vi.fn(() => ({}))
      }
    })

    const response = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'malformed-decision-id')
      .send({ url: 'https://example.com' })
      .expect(503)

    expect(response.headers['x-request-id']).toBe('malformed-decision-id')
    expect(response.headers['ratelimit-limit']).toBeUndefined()
    expect(response.headers['ratelimit-remaining']).toBeUndefined()
    expect(response.headers['ratelimit-reset']).toBeUndefined()
    expect(response.headers['retry-after']).toBeUndefined()
    expect(response.headers['x-cache']).toBeUndefined()
    expect(response.body.error).toEqual({
      code: 'RATE_LIMITER_UNAVAILABLE',
      message: 'Audit request limiting is temporarily unavailable.',
      details: []
    })
    expectNoAuditWork(dependencies)
  })

  it('omits rate-limit headers when disabled and leaves non-audit routes unaffected', async () => {
    const { app } = createTestApp({
      config: { AUDIT_RATE_LIMIT_ENABLED: false, AUDIT_RATE_LIMIT_MAX_REQUESTS: 1 }
    })

    const first = await request(app).post('/api/v1/audits').send({ url: 'https://example.com/a' }).expect(200)
    const second = await request(app).post('/api/v1/audits').send({ url: 'https://example.com/b' }).expect(200)
    const health = await request(app).get('/healthz').expect(200)
    const apiRoot = await request(app).get('/api').expect(404)
    const unknown = await request(app).get('/unknown').expect(404)

    for (const response of [first, second, health, apiRoot, unknown]) {
      expect(response.headers['ratelimit-limit']).toBeUndefined()
      expect(response.headers['ratelimit-remaining']).toBeUndefined()
      expect(response.headers['ratelimit-reset']).toBeUndefined()
      expect(response.headers['retry-after']).toBeUndefined()
    }
  })

  it('does not rate-limit health, API root, unknown routes, or OPTIONS requests', async () => {
    const { app } = createTestApp({
      config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 1, AUDIT_CACHE_ENABLED: false }
    })

    await request(app).post('/api/v1/audits').send({ url: 'https://example.com/a' }).expect(200)
    await request(app).post('/api/v1/audits').send({ url: 'https://example.com/b' }).expect(429)

    const health = await request(app).get('/healthz').expect(200)
    const apiRoot = await request(app).get('/api').expect(404)
    const unknown = await request(app).get('/unknown').expect(404)
    const options = await request(app).options('/api/v1/audits')

    for (const response of [health, apiRoot, unknown, options]) {
      expect(response.headers['ratelimit-limit']).toBeUndefined()
      expect(response.headers['ratelimit-remaining']).toBeUndefined()
      expect(response.headers['ratelimit-reset']).toBeUndefined()
      expect(response.headers['retry-after']).toBeUndefined()
    }
  })

  it('uses Express trust proxy settings for client identity', async () => {
    const untrusted = createTestApp({
      config: { TRUST_PROXY: false, AUDIT_RATE_LIMIT_MAX_REQUESTS: 1, AUDIT_CACHE_ENABLED: false }
    })

    await request(untrusted.app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '198.51.100.10')
      .send({ url: 'https://example.com/a' })
      .expect(200)
    await request(untrusted.app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ url: 'https://example.com/b' })
      .expect(429)

    const trusted = createTestApp({
      config: { TRUST_PROXY: true, AUDIT_RATE_LIMIT_MAX_REQUESTS: 1, AUDIT_CACHE_ENABLED: false }
    })
    await request(trusted.app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '198.51.100.10')
      .send({ url: 'https://example.com/a' })
      .expect(200)
    await request(trusted.app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '203.0.113.10')
      .send({ url: 'https://example.com/b' })
      .expect(200)

    const oneHop = createTestApp({
      config: { TRUST_PROXY: 1, AUDIT_RATE_LIMIT_MAX_REQUESTS: 1, AUDIT_CACHE_ENABLED: false }
    })
    await request(oneHop.app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '198.51.100.10, 203.0.113.10')
      .send({ url: 'https://example.com/a' })
      .expect(200)
    await request(oneHop.app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '198.51.100.10, 203.0.113.11')
      .send({ url: 'https://example.com/b' })
      .expect(200)
  })

  it('uses one limiter bucket for equivalent plain IPv4 and IPv4-mapped IPv6 identities', async () => {
    const { app } = createTestApp({
      config: { TRUST_PROXY: true, AUDIT_RATE_LIMIT_MAX_REQUESTS: 1, AUDIT_CACHE_ENABLED: false }
    })

    await request(app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '127.0.0.1')
      .send({ url: 'https://example.com/a' })
      .expect(200)
    const mapped = await request(app)
      .post('/api/v1/audits')
      .set('X-Forwarded-For', '::ffff:127.0.0.1')
      .send({ url: 'https://example.com/b' })
      .expect(429)

    expect(mapped.body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expectRateHeaders(mapped, 1, 0)
  })

  it('keeps limiter state isolated per app instance and leaves the success body unchanged', async () => {
    const appA = createTestApp({ config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 1 } })
    const appB = createTestApp({ config: { AUDIT_RATE_LIMIT_MAX_REQUESTS: 1 } })

    const firstA = await request(appA.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    await request(appA.app).post('/api/v1/audits').send({ url: 'https://example.com/a' }).expect(429)
    await request(appB.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)

    expect(firstA.body.data).not.toHaveProperty('rateLimit')
    expect(firstA.body.data.cached).toBe(false)
    expect(firstA.body.data.auditStatus).toBe('complete')
    expect(firstA.body.data.score).toBe(100)
    expect(firstA.body.data.grade).toBe('A')
    expect(JSON.stringify(firstA.body)).not.toContain('<h1>')
    expect(JSON.stringify(firstA.body)).not.toContain('session=secret')
  })
})
