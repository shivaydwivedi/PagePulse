import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { createTtlCache } from '../../src/infrastructure/cache/ttl-cache.js'
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
  AUDIT_QUEUE_TIMEOUT_MS: 2000
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

async function waitFor(assertion, timeoutMs = 1000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (assertion()) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  throw new Error('Timed out waiting for integration test condition.')
}

function createTransportResult(normalisedUrl, overrides = {}) {
  return {
    requestedUrl: normalisedUrl,
    finalUrl: normalisedUrl,
    statusCode: overrides.statusCode ?? 200,
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
    responseTimeMs: overrides.responseTimeMs ?? 11,
    redirectCount: 0,
    auditedAt: overrides.auditedAt ?? '2026-07-27T00:00:00.000Z',
    body: Buffer.from(`
      <html lang="en">
        <head>
          <title>Healthy Example Page</title>
          <meta name="description" content="This is a useful page summary written for deterministic cache tests.">
          <link rel="canonical" href="${normalisedUrl}">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body><h1>Healthy Example</h1><img src="/logo.png" alt="Logo"><a href="/about">About</a></body>
      </html>
    `)
  }
}

function createTestApp(options = {}) {
  const fetchCalls = []
  let activeTransports = 0
  let maxActiveTransports = 0

  const app = createApp({
    config: { ...baseConfig, ...options.config },
    auditCache: options.auditCache,
    auditHttpClient: {
      async fetchAuditTarget(normalisedUrl) {
        fetchCalls.push(normalisedUrl)
        activeTransports += 1
        maxActiveTransports = Math.max(maxActiveTransports, activeTransports)

        try {
          const handler = options.handlers?.[normalisedUrl]
          if (handler) {
            return await handler(normalisedUrl)
          }

          return createTransportResult(normalisedUrl, options.transportOverrides?.[normalisedUrl])
        } finally {
          activeTransports -= 1
        }
      }
    }
  })

  return {
    app,
    fetchCalls,
    get maxActiveTransports() {
      return maxActiveTransports
    }
  }
}

describe('audit cache and concurrency integration', () => {
  it('returns MISS then HIT for equivalent URLs with fresh request IDs and no cached request ID', async () => {
    const backingCache = createTtlCache({ enabled: true, ttlMs: 300000, maxEntries: 500, clock: () => 0 })
    const storedValues = []
    const inspectionCache = {
      get: (key) => backingCache.get(key),
      set(key, value) {
        storedValues.push(structuredClone(value))
        backingCache.set(key, value)
      },
      delete: (key) => backingCache.delete(key)
    }
    const { app, fetchCalls } = createTestApp({ auditCache: inspectionCache })

    const first = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'fresh-request-a')
      .send({ url: 'https://EXAMPLE.com:443/#section' })
      .expect(200)

    const second = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'hit-request-b')
      .send({ url: 'https://example.com/' })
      .expect(200)

    expect(first.headers['x-cache']).toBe('MISS')
    expect(second.headers['x-cache']).toBe('HIT')
    expect(first.body.requestId).toBe('fresh-request-a')
    expect(second.body.requestId).toBe('hit-request-b')
    expect(first.body.data.cached).toBe(false)
    expect(second.body.data.cached).toBe(true)
    expect(second.body.data.auditedAt).toBe(first.body.data.auditedAt)
    expect(second.body.data.responseTimeMs).toBe(first.body.data.responseTimeMs)
    expect(second.body.data.score).toBe(first.body.data.score)
    expect(JSON.stringify(second.body.data)).not.toContain('fresh-request-a')
    expect(JSON.stringify(second.body.data)).not.toContain('hit-request-b')
    expect(JSON.stringify(storedValues[0])).not.toContain('fresh-request-a')
    expect(JSON.stringify(storedValues[0])).not.toContain('hit-request-b')
    expect(storedValues[0]).not.toHaveProperty('requestId')
    expect(storedValues[0]).not.toHaveProperty('success')
    expect(storedValues[0]).not.toHaveProperty('cached')
    first.body.data.requestId = 'fresh-request-a'
    const third = await request(app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'hit-request-c')
      .send({ url: 'https://example.com/' })
      .expect(200)
    expect(third.headers['x-cache']).toBe('HIT')
    expect(JSON.stringify(storedValues[0])).not.toContain('fresh-request-a')
    expect(JSON.stringify(second.body)).not.toContain('<h1>')
    expect(JSON.stringify(second.body)).not.toContain('session=secret')
    expect(fetchCalls).toEqual(['https://example.com/'])
  })

  it('bypasses cache when disabled and caches completed upstream 404 and 500 HTML audits', async () => {
    const disabled = createTestApp({ config: { AUDIT_CACHE_ENABLED: false } })

    await request(disabled.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    await request(disabled.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    expect(disabled.fetchCalls).toEqual(['https://example.com/', 'https://example.com/'])

    for (const statusCode of [404, 500]) {
      const cached = createTestApp({
        transportOverrides: {
          'https://example.com/': { statusCode }
        }
      })

      const first = await request(cached.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
      const second = await request(cached.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)

      expect(first.headers['x-cache']).toBe('MISS')
      expect(second.headers['x-cache']).toBe('HIT')
      expect(second.body.data.httpStatus).toBe(statusCode)
      expect(second.body.data.issues.map((issue) => issue.code)).toContain('UPSTREAM_HTTP_STATUS')
      expect(cached.fetchCalls).toHaveLength(1)
    }
  })

  it('lets cache hits complete while active capacity is full', async () => {
    const slow = deferred()
    const test = createTestApp({
      config: { AUDIT_MAX_CONCURRENT: 1, AUDIT_MAX_QUEUE_SIZE: 0 },
      handlers: {
        'https://slow.example/': async (normalisedUrl) => {
          await slow.promise
          return createTransportResult(normalisedUrl)
        }
      }
    })

    await request(test.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    const active = request(test.app)
      .post('/api/v1/audits')
      .send({ url: 'https://slow.example' })
      .expect(200)
      .then((response) => response)
    const hit = await request(test.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)

    expect(hit.headers['x-cache']).toBe('HIT')
    expect(hit.body.data.cached).toBe(true)

    slow.resolve()
    await active
  })

  it('enforces active concurrency, FIFO queueing, queue full, and queue timeout', async () => {
    const firstGate = deferred()
    const secondGate = deferred()
    const firstStarted = deferred()
    const order = []
    const queueFullTest = createTestApp({
      config: { AUDIT_MAX_CONCURRENT: 1, AUDIT_MAX_QUEUE_SIZE: 1, AUDIT_QUEUE_TIMEOUT_MS: 5000 },
      handlers: {
        'https://first.example/': async (normalisedUrl) => {
          order.push('first')
          firstStarted.resolve()
          await firstGate.promise
          return createTransportResult(normalisedUrl)
        },
        'https://second.example/': async (normalisedUrl) => {
          order.push('second')
          await secondGate.promise
          return createTransportResult(normalisedUrl)
        }
      }
    })

    const first = request(queueFullTest.app)
      .post('/api/v1/audits')
      .send({ url: 'https://first.example' })
      .expect(200)
      .then((response) => response)
    await firstStarted.promise
    const second = request(queueFullTest.app)
      .post('/api/v1/audits')
      .send({ url: 'https://second.example' })
      .expect(200)
      .then((response) => response)
    await waitFor(() => queueFullTest.app.locals.auditSemaphore.queueSize === 1)
    const third = await request(queueFullTest.app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'queue-full-id')
      .send({ url: 'https://third.example' })
      .expect(503)

    expect(third.headers['x-cache']).toBeUndefined()
    expect(third.headers['x-request-id']).toBe('queue-full-id')
    expect(third.body.error.code).toBe('AUDIT_CAPACITY_EXCEEDED')
    expect(third.body.error.details).toEqual([{ reason: 'queue_full' }])
    expect(queueFullTest.maxActiveTransports).toBe(1)

    firstGate.resolve()
    await first
    expect(order).toEqual(['first', 'second'])
    secondGate.resolve()
    await second

    const timeoutGate = deferred()
    const timeoutStarted = deferred()
    const timeoutTest = createTestApp({
      config: { AUDIT_MAX_CONCURRENT: 1, AUDIT_MAX_QUEUE_SIZE: 1, AUDIT_QUEUE_TIMEOUT_MS: 100 },
      handlers: {
        'https://timeout-active.example/': async (normalisedUrl) => {
          timeoutStarted.resolve()
          await timeoutGate.promise
          return createTransportResult(normalisedUrl)
        }
      }
    })
    const active = request(timeoutTest.app)
      .post('/api/v1/audits')
      .send({ url: 'https://timeout-active.example' })
      .expect(200)
      .then((response) => response)
    await timeoutStarted.promise
    const timedOut = await request(timeoutTest.app)
      .post('/api/v1/audits')
      .send({ url: 'https://timeout-queued.example' })
      .expect(503)

    expect(timedOut.body.error).toMatchObject({
      code: 'AUDIT_CAPACITY_EXCEEDED',
      details: [{ reason: 'queue_timeout' }]
    })

    timeoutGate.resolve()
    await active
  })

  it('performs a second cache lookup after waiting and releases permits after failures', async () => {
    const sameUrlGate = deferred()
    const sameUrlStarted = deferred()
    const duplicateTest = createTestApp({
      config: { AUDIT_MAX_CONCURRENT: 1, AUDIT_MAX_QUEUE_SIZE: 1 },
      handlers: {
        'https://duplicate.example/': async (normalisedUrl) => {
          sameUrlStarted.resolve()
          await sameUrlGate.promise
          return createTransportResult(normalisedUrl)
        }
      }
    })

    const first = request(duplicateTest.app)
      .post('/api/v1/audits')
      .send({ url: 'https://duplicate.example' })
      .expect(200)
      .then((response) => response)
    await sameUrlStarted.promise
    const second = request(duplicateTest.app)
      .post('/api/v1/audits')
      .send({ url: 'https://duplicate.example' })
      .expect(200)
      .then((response) => response)
    await waitFor(() => duplicateTest.app.locals.auditSemaphore.queueSize === 1)

    sameUrlGate.resolve()
    await first
    const secondResponse = await second

    expect(secondResponse.headers['x-cache']).toBe('HIT')
    expect(duplicateTest.fetchCalls).toEqual(['https://duplicate.example/'])

    const failureTest = createTestApp({
      config: { AUDIT_MAX_CONCURRENT: 1, AUDIT_MAX_QUEUE_SIZE: 1 },
      handlers: {
        'https://fail.example/': async () => {
          throw new Error('transport failed')
        }
      }
    })

    await request(failureTest.app).post('/api/v1/audits').send({ url: 'https://fail.example' }).expect(500)
    await request(failureTest.app).post('/api/v1/audits').send({ url: 'https://after-fail.example' }).expect(200)
  })

  it('omits X-Cache on validation, transport, analyser, scorer, and capacity errors', async () => {
    const validation = await request(createTestApp().app)
      .post('/api/v1/audits')
      .send({})
      .expect(400)
    expect(validation.headers['x-cache']).toBeUndefined()

    const transportErrors = [
      ['BLOCKED_TARGET', 400],
      ['DNS_LOOKUP_FAILED', 502],
      ['UPSTREAM_TIMEOUT', 504],
      ['UPSTREAM_CONNECTION_FAILED', 502],
      ['UPSTREAM_TLS_ERROR', 502],
      ['INVALID_REDIRECT', 502],
      ['RESPONSE_TOO_LARGE', 502],
      ['UPSTREAM_UNSUPPORTED_CONTENT', 422]
    ]

    for (const [code, statusCode] of transportErrors) {
      const test = createTestApp({
        handlers: {
          'https://example.com/': async () => {
            throw new AppError({ code, message: code, statusCode })
          }
        }
      })
      const response = await request(test.app).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(statusCode)

      expect(response.headers['x-cache']).toBeUndefined()
      expect(response.body.error.code).toBe(code)
    }

    const analyserApp = createApp({
      config: baseConfig,
      auditHttpClient: {
        async fetchAuditTarget(normalisedUrl) {
          return createTransportResult(normalisedUrl)
        }
      },
      htmlAnalysisService: {
        analyse() {
          throw new Error('raw analyser failure')
        }
      }
    })
    const analyser = await request(analyserApp).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(500)
    expect(analyser.headers['x-cache']).toBeUndefined()

    const scorerApp = createApp({
      config: baseConfig,
      auditHttpClient: {
        async fetchAuditTarget(normalisedUrl) {
          return createTransportResult(normalisedUrl)
        }
      },
      auditScorer: {
        score() {
          throw new Error('raw scorer failure')
        }
      }
    })
    const scorer = await request(scorerApp).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(500)
    expect(scorer.headers['x-cache']).toBeUndefined()

    const capacityGate = deferred()
    const capacityTest = createTestApp({
      config: { AUDIT_MAX_CONCURRENT: 1, AUDIT_MAX_QUEUE_SIZE: 0 },
      handlers: {
        'https://capacity-active.example/': async (normalisedUrl) => {
          await capacityGate.promise
          return createTransportResult(normalisedUrl)
        }
      }
    })
    const active = request(capacityTest.app)
      .post('/api/v1/audits')
      .send({ url: 'https://capacity-active.example' })
      .expect(200)
      .then((response) => response)
    await waitFor(() => capacityTest.app.locals.auditSemaphore.activeCount === 1)
    const capacity = await request(capacityTest.app)
      .post('/api/v1/audits')
      .set('X-Request-ID', 'capacity-error-id')
      .send({ url: 'https://capacity-fail.example' })
      .expect(503)

    expect(capacity.headers['x-cache']).toBeUndefined()
    expect(capacity.headers['x-request-id']).toBe('capacity-error-id')
    expect(capacity.body.error.code).toBe('AUDIT_CAPACITY_EXCEEDED')
    expect(capacity.body.error).not.toHaveProperty('activeCount')
    expect(capacity.body.error).not.toHaveProperty('queueSize')
    expect(JSON.stringify(capacity.body)).not.toContain('capacity-active.example')
    capacityGate.resolve()
    await active
  })

  it('returns MISS when cache read, cache write, or malformed cached values fail open to fresh success', async () => {
    const readFailureApp = createApp({
      config: baseConfig,
      auditCache: {
        get() {
          throw new Error('cache read failed')
        },
        set() {}
      },
      auditHttpClient: {
        async fetchAuditTarget(normalisedUrl) {
          return createTransportResult(normalisedUrl)
        }
      }
    })
    const readFailure = await request(readFailureApp).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    expect(readFailure.headers['x-cache']).toBe('MISS')
    expect(readFailure.body.data.cached).toBe(false)

    const writeFailureApp = createApp({
      config: baseConfig,
      auditCache: {
        get() {
          return undefined
        },
        set() {
          throw new Error('cache write failed')
        }
      },
      auditHttpClient: {
        async fetchAuditTarget(normalisedUrl) {
          return createTransportResult(normalisedUrl)
        }
      }
    })
    const writeFailure = await request(writeFailureApp).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    expect(writeFailure.headers['x-cache']).toBe('MISS')
    expect(writeFailure.body.data.cached).toBe(false)

    const malformedCacheApp = createApp({
      config: baseConfig,
      auditCache: {
        get() {
          return {}
        },
        set() {},
        delete() {}
      },
      auditHttpClient: {
        async fetchAuditTarget(normalisedUrl) {
          return createTransportResult(normalisedUrl)
        }
      }
    })
    const malformed = await request(malformedCacheApp).post('/api/v1/audits').send({ url: 'https://example.com' }).expect(200)
    expect(malformed.headers['x-cache']).toBe('MISS')
    expect(malformed.body.data.cached).toBe(false)
  })
})
