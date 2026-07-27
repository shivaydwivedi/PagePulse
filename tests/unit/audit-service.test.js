import { describe, expect, it, vi } from 'vitest'
import { createTtlCache } from '../../src/infrastructure/cache/ttl-cache.js'
import { auditCapacityError } from '../../src/infrastructure/concurrency/audit-semaphore.js'
import { prepareAuditRequest } from '../../src/services/audit.service.js'
import { AppError } from '../../src/utils/errors.js'
import { scoringPolicy } from '../../src/scoring/scoring-policy.js'

function checksWith(status = 'pass', overrides = {}) {
  return Object.fromEntries(scoringPolicy.checkOrder.map((checkName) => [
    checkName,
    {
      status: overrides[checkName] ?? status,
      summary: `${checkName} summary`,
      details: { text: checkName }
    }
  ]))
}

function transportResult(overrides = {}) {
  return {
    requestedUrl: overrides.requestedUrl ?? 'https://example.com/',
    finalUrl: overrides.finalUrl ?? 'https://example.com/',
    statusCode: overrides.statusCode ?? 200,
    headers: overrides.headers ?? { 'content-type': 'text/html', 'set-cookie': 'session=secret' },
    contentType: 'text/html',
    responseSizeBytes: overrides.responseSizeBytes ?? 100,
    responseTimeMs: overrides.responseTimeMs ?? 10,
    redirectCount: 0,
    auditedAt: overrides.auditedAt ?? '2026-07-27T00:00:00.000Z',
    body: Buffer.from('<html><body><h1>secret raw html</h1></body></html>')
  }
}

function analysisResult(overrides = {}) {
  return {
    page: overrides.page ?? { title: 'Example', headingCount: 1 },
    checks: overrides.checks ?? checksWith('pass', { images: 'not_applicable' }),
    issues: overrides.issues ?? []
  }
}

function scoringResult(overrides = {}) {
  return {
    scoringPolicyVersion: '1.0',
    earnedPoints: overrides.earnedPoints ?? 92,
    possiblePoints: overrides.possiblePoints ?? 92,
    excludedPoints: overrides.excludedPoints ?? 8,
    breakdown: overrides.breakdown ?? {
      images: {
        status: 'not_applicable',
        weight: 8,
        applicable: false,
        earnedPoints: 0
      }
    },
    score: overrides.score ?? 100,
    grade: overrides.grade ?? 'A'
  }
}

function completeCachedPayload(overrides = {}) {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    httpStatus: overrides.httpStatus ?? 200,
    redirectCount: 0,
    responseTimeMs: 10,
    contentType: 'text/html',
    responseSizeBytes: 100,
    auditedAt: '2026-07-27T00:00:00.000Z',
    auditStatus: 'complete',
    score: 100,
    grade: 'A',
    scoring: {
      scoringPolicyVersion: '1.0',
      earnedPoints: 100,
      possiblePoints: 100,
      excludedPoints: 0,
      breakdown: {}
    },
    page: { title: 'Cached' },
    checks: checksWith(),
    issues: []
  }
}

function createDependencies(overrides = {}) {
  const transport = overrides.transportResult ?? transportResult()
  const analysis = overrides.analysisResult ?? analysisResult()
  const scoring = overrides.scoringResult ?? scoringResult()

  return {
    auditHttpClient: {
      fetchAuditTarget: vi.fn(async () => transport)
    },
    htmlAnalysisService: {
      analyse: vi.fn(() => analysis)
    },
    auditScorer: {
      score: vi.fn(() => scoring)
    }
  }
}

function createReleaseTrackingSemaphore() {
  const release = vi.fn()

  return {
    release,
    semaphore: {
      acquire: vi.fn(async () => release)
    }
  }
}

describe('audit service cache and concurrency orchestration', () => {
  it('stores the first successful audit and returns equivalent normalised URLs as cache hits', async () => {
    const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 10, clock: () => 0 })
    const deps = createDependencies()
    const { semaphore } = createReleaseTrackingSemaphore()

    const first = await prepareAuditRequest({ url: 'https://EXAMPLE.com:443/#section' }, {
      ...deps,
      auditCache: cache,
      auditSemaphore: semaphore
    })
    const second = await prepareAuditRequest({ url: 'https://example.com/' }, {
      ...deps,
      auditCache: cache,
      auditSemaphore: semaphore
    })

    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.payload).toEqual(first.payload)
    expect(second.payload).not.toHaveProperty('requestId')
    expect(second.payload).not.toHaveProperty('cached')
    expect(second.payload).not.toHaveProperty('headers')
    expect(second.payload).not.toHaveProperty('body')
    expect(deps.auditHttpClient.fetchAuditTarget).toHaveBeenCalledTimes(1)
    expect(deps.htmlAnalysisService.analyse).toHaveBeenCalledTimes(1)
    expect(deps.auditScorer.score).toHaveBeenCalledTimes(1)
    expect(semaphore.acquire).toHaveBeenCalledTimes(1)
  })

  it('treats malformed cached values as misses and keeps valid complete payloads as hits', async () => {
    const malformedValues = [
      {},
      { requestedUrl: 'x' },
      null,
      'cached',
      [],
      { ...completeCachedPayload(), score: undefined },
      { ...completeCachedPayload(), grade: 'Z' },
      { ...completeCachedPayload(), requestId: 'cached-request-id' },
      { ...completeCachedPayload(), cached: true },
      { ...completeCachedPayload(), body: Buffer.from('raw') },
      { ...completeCachedPayload(), unknown: true }
    ]

    for (const malformedValue of malformedValues) {
      const deps = createDependencies()
      const cache = {
        get: vi.fn(() => malformedValue),
        set: vi.fn(),
        delete: vi.fn()
      }

      const result = await prepareAuditRequest({ url: 'https://example.com' }, {
        ...deps,
        auditCache: cache
      })

      expect(result.cached).toBe(false)
      expect(deps.auditHttpClient.fetchAuditTarget).toHaveBeenCalledTimes(1)
      expect(deps.htmlAnalysisService.analyse).toHaveBeenCalledTimes(1)
      expect(deps.auditScorer.score).toHaveBeenCalledTimes(1)
      if (malformedValue !== null) {
        expect(cache.delete).toHaveBeenCalledWith('https://example.com/')
      }
    }

    const validPayload = completeCachedPayload()
    const validDeps = createDependencies()
    const validCache = {
      get: vi.fn(() => validPayload),
      set: vi.fn(),
      delete: vi.fn()
    }

    const validHit = await prepareAuditRequest({ url: 'https://example.com' }, {
      ...validDeps,
      auditCache: validCache
    })

    expect(validHit).toEqual({ payload: validPayload, cached: true })
    expect(validDeps.auditHttpClient.fetchAuditTarget).not.toHaveBeenCalled()
    expect(validCache.delete).not.toHaveBeenCalled()
  })

  it('stores only the completed public audit payload in cache', async () => {
    const deps = createDependencies()
    const cache = {
      get: vi.fn(() => undefined),
      set: vi.fn()
    }

    await prepareAuditRequest({ url: 'https://example.com' }, {
      ...deps,
      auditCache: cache
    })

    const storedValue = cache.set.mock.calls[0][1]
    expect(Object.keys(storedValue)).toEqual([
      'requestedUrl',
      'finalUrl',
      'httpStatus',
      'redirectCount',
      'responseTimeMs',
      'contentType',
      'responseSizeBytes',
      'auditedAt',
      'auditStatus',
      'score',
      'grade',
      'scoring',
      'page',
      'checks',
      'issues'
    ])
    for (const forbiddenKey of [
      'requestId',
      'success',
      'cached',
      'body',
      'headers',
      'addresses',
      'errors',
      'X-Cache'
    ]) {
      expect(storedValue).not.toHaveProperty(forbiddenKey)
    }
  })

  it('protects cached payloads from response mutation', async () => {
    const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 10, clock: () => 0 })
    const deps = createDependencies()

    const first = await prepareAuditRequest({ url: 'https://example.com' }, {
      ...deps,
      auditCache: cache
    })
    first.payload.scoring.breakdown.images.earnedPoints = 8
    first.payload.checks.images.status = 'pass'
    first.payload.issues.push({ code: 'MUTATED' })

    const second = await prepareAuditRequest({ url: 'https://example.com' }, {
      ...deps,
      auditCache: cache
    })

    expect(second.cached).toBe(true)
    expect(second.payload.scoring.breakdown.images.earnedPoints).toBe(0)
    expect(second.payload.checks.images.status).toBe('not_applicable')
    expect(second.payload.issues).toEqual([])
  })

  it('expires cached entries and disabled cache triggers fresh audits every time', async () => {
    let currentTime = 0
    const expiringCache = createTtlCache({
      enabled: true,
      ttlMs: 1000,
      maxEntries: 10,
      clock: () => currentTime
    })
    const expiringDeps = createDependencies()

    await prepareAuditRequest({ url: 'https://example.com' }, { ...expiringDeps, auditCache: expiringCache })
    currentTime = 1000
    const expired = await prepareAuditRequest({ url: 'https://example.com' }, { ...expiringDeps, auditCache: expiringCache })

    expect(expired.cached).toBe(false)
    expect(expiringDeps.auditHttpClient.fetchAuditTarget).toHaveBeenCalledTimes(2)

    const disabledCache = createTtlCache({ enabled: false, ttlMs: 1000, maxEntries: 10, clock: () => 0 })
    const disabledDeps = createDependencies()

    await prepareAuditRequest({ url: 'https://example.com' }, { ...disabledDeps, auditCache: disabledCache })
    await prepareAuditRequest({ url: 'https://example.com' }, { ...disabledDeps, auditCache: disabledCache })

    expect(disabledDeps.auditHttpClient.fetchAuditTarget).toHaveBeenCalledTimes(2)
  })

  it('does not cache transport, analysis, scorer, or capacity failures and releases permits', async () => {
    for (const failingDependency of ['transport', 'analysis', 'scorer']) {
      const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 10, clock: () => 0 })
      const deps = createDependencies()
      const { semaphore, release } = createReleaseTrackingSemaphore()

      if (failingDependency === 'transport') {
        deps.auditHttpClient.fetchAuditTarget.mockRejectedValueOnce(new Error('transport failed'))
      }

      if (failingDependency === 'analysis') {
        deps.htmlAnalysisService.analyse.mockImplementationOnce(() => {
          throw new Error('analysis failed')
        })
      }

      if (failingDependency === 'scorer') {
        deps.auditScorer.score.mockImplementationOnce(() => {
          throw new Error('scorer failed')
        })
      }

      await expect(prepareAuditRequest({ url: 'https://example.com' }, {
        ...deps,
        auditCache: cache,
        auditSemaphore: semaphore
      })).rejects.toThrow(`${failingDependency} failed`)

      expect(release).toHaveBeenCalledTimes(1)
      expect(cache.get('https://example.com/')).toBeUndefined()
    }

    const capacityCache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 10, clock: () => 0 })
    const capacityDeps = createDependencies()
    const capacitySemaphore = {
      acquire: vi.fn(async () => {
        throw new Error('capacity failed')
      })
    }

    await expect(prepareAuditRequest({ url: 'https://example.com' }, {
      ...capacityDeps,
      auditCache: capacityCache,
      auditSemaphore: capacitySemaphore
    })).rejects.toThrow('capacity failed')
    expect(capacityCache.get('https://example.com/')).toBeUndefined()
    expect(capacityDeps.auditHttpClient.fetchAuditTarget).not.toHaveBeenCalled()
  })

  it('does not cache representative audit errors', async () => {
    const errorCases = [
      ['BLOCKED_TARGET', () => new AppError({ code: 'BLOCKED_TARGET', message: 'blocked', statusCode: 400 })],
      ['DNS_LOOKUP_FAILED', () => new AppError({ code: 'DNS_LOOKUP_FAILED', message: 'dns', statusCode: 502 })],
      ['UPSTREAM_TIMEOUT', () => new AppError({ code: 'UPSTREAM_TIMEOUT', message: 'timeout', statusCode: 504 })],
      ['UPSTREAM_CONNECTION_FAILED', () => new AppError({ code: 'UPSTREAM_CONNECTION_FAILED', message: 'connect', statusCode: 502 })],
      ['UPSTREAM_TLS_ERROR', () => new AppError({ code: 'UPSTREAM_TLS_ERROR', message: 'tls', statusCode: 502 })],
      ['INVALID_REDIRECT', () => new AppError({ code: 'INVALID_REDIRECT', message: 'redirect', statusCode: 502 })],
      ['RESPONSE_TOO_LARGE', () => new AppError({ code: 'RESPONSE_TOO_LARGE', message: 'large', statusCode: 502 })],
      ['UPSTREAM_UNSUPPORTED_CONTENT', () => new AppError({ code: 'UPSTREAM_UNSUPPORTED_CONTENT', message: 'content', statusCode: 422 })],
      ['analyser INTERNAL_ERROR', () => new Error('analyser internal')],
      ['scorer INTERNAL_ERROR', () => new Error('scorer internal')],
      ['AUDIT_CAPACITY_EXCEEDED', () => auditCapacityError('queue_full')]
    ]

    for (const [name, createError] of errorCases) {
      const deps = createDependencies()
      const cache = { get: vi.fn(() => undefined), set: vi.fn() }
      const error = createError()

      if (name === 'analyser INTERNAL_ERROR') {
        deps.htmlAnalysisService.analyse.mockImplementation(() => {
          throw error
        })
      } else if (name === 'scorer INTERNAL_ERROR') {
        deps.auditScorer.score.mockImplementation(() => {
          throw error
        })
      } else if (name === 'AUDIT_CAPACITY_EXCEEDED') {
        deps.auditHttpClient.fetchAuditTarget.mockClear()
      } else {
        deps.auditHttpClient.fetchAuditTarget.mockRejectedValue(error)
      }

      const options = {
        ...deps,
        auditCache: cache,
        auditSemaphore: name === 'AUDIT_CAPACITY_EXCEEDED'
          ? { acquire: vi.fn(async () => { throw error }) }
          : undefined
      }

      await expect(prepareAuditRequest({ url: 'https://example.com' }, options)).rejects.toThrow()
      await expect(prepareAuditRequest({ url: 'https://example.com' }, options)).rejects.toThrow()

      expect(cache.set).not.toHaveBeenCalled()
      expect(cache.get).toHaveBeenCalledTimes(name === 'AUDIT_CAPACITY_EXCEEDED' ? 2 : 4)
      if (name !== 'AUDIT_CAPACITY_EXCEEDED') {
        expect(deps.auditHttpClient.fetchAuditTarget).toHaveBeenCalledTimes(2)
      }
    }
  })

  it('fails open on cache read and write errors', async () => {
    const readFailingCache = {
      get: vi.fn(() => {
        throw new Error('cache read failed')
      }),
      set: vi.fn()
    }
    const readDeps = createDependencies()
    const readResult = await prepareAuditRequest({ url: 'https://example.com' }, {
      ...readDeps,
      auditCache: readFailingCache
    })

    expect(readResult.cached).toBe(false)
    expect(readDeps.auditHttpClient.fetchAuditTarget).toHaveBeenCalledTimes(1)

    const writeFailingCache = {
      get: vi.fn(() => undefined),
      set: vi.fn(() => {
        throw new Error('cache write failed')
      })
    }
    const writeDeps = createDependencies()
    const writeResult = await prepareAuditRequest({ url: 'https://example.com' }, {
      ...writeDeps,
      auditCache: writeFailingCache
    })

    expect(writeResult.cached).toBe(false)
    expect(writeResult.payload.score).toBe(100)
  })

  it('checks cache again after acquiring a permit and releases without duplicate transport work', async () => {
    const cachedPayload = completeCachedPayload()
    const cache = {
      get: vi.fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(cachedPayload),
      set: vi.fn()
    }
    const deps = createDependencies()
    const { semaphore, release } = createReleaseTrackingSemaphore()

    const result = await prepareAuditRequest({ url: 'https://example.com' }, {
      ...deps,
      auditCache: cache,
      auditSemaphore: semaphore
    })

    expect(result.cached).toBe(true)
    expect(result.payload).toEqual(cachedPayload)
    expect(release).toHaveBeenCalledTimes(1)
    expect(deps.auditHttpClient.fetchAuditTarget).not.toHaveBeenCalled()
    expect(deps.htmlAnalysisService.analyse).not.toHaveBeenCalled()
    expect(deps.auditScorer.score).not.toHaveBeenCalled()
    expect(cache.set).not.toHaveBeenCalled()
  })
})
