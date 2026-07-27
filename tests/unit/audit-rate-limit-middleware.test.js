import { describe, expect, it, vi } from 'vitest'
import { createAuditRateLimitMiddleware } from '../../src/middleware/audit-rate-limit.middleware.js'

function createResponse() {
  const headers = {}

  return {
    headers,
    set: vi.fn((name, value) => {
      headers[name.toLowerCase()] = value
    })
  }
}

describe('audit rate-limit middleware', () => {
  it('sets integer rate-limit headers and calls next once for allowed requests', () => {
    const resetAt = Date.now() + 60000
    const req = { id: 'existing-request-id', ip: '203.0.113.10' }
    const res = createResponse()
    const next = vi.fn()
    const limiter = {
      consume: vi.fn(() => ({
        allowed: true,
        limit: 3,
        remaining: 2,
        resetAt,
        retryAfterSeconds: 0
      }))
    }

    createAuditRateLimitMiddleware(limiter)(req, res, next)

    expect(limiter.consume).toHaveBeenCalledWith('203.0.113.10')
    expect(next).toHaveBeenCalledTimes(1)
    expect(next).toHaveBeenCalledWith()
    expect(res.headers).toEqual({
      'ratelimit-limit': '3',
      'ratelimit-remaining': '2',
      'ratelimit-reset': '60'
    })
    expect(Object.values(res.headers).every((value) => /^\d+$/.test(value))).toBe(true)
    expect(res.headers['retry-after']).toBeUndefined()
    expect(req.id).toBe('existing-request-id')
  })

  it('rejects over-limit requests without calling next as allowed', () => {
    const resetAt = Date.now() + 17000
    const req = { id: 'existing-request-id', ip: '203.0.113.10' }
    const res = createResponse()
    const next = vi.fn()
    const limiter = {
      consume: vi.fn(() => ({
        allowed: false,
        limit: 3,
        remaining: 0,
        resetAt,
        retryAfterSeconds: 17
      }))
    }

    createAuditRateLimitMiddleware(limiter)(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    const error = next.mock.calls[0][0]
    expect(error).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      statusCode: 429,
      publicMessage: 'Too many audit requests. Please try again later.',
      details: [{ retryAfterSeconds: 17 }]
    })
    expect(JSON.stringify(error)).not.toContain('203.0.113.10')
    expect(res.headers['retry-after']).toBe('17')
  })

  it('omits headers when disabled', () => {
    const req = { id: 'existing-request-id', ip: '203.0.113.10' }
    const res = createResponse()
    const next = vi.fn()
    const limiter = {
      enabled: false,
      consume: vi.fn()
    }

    createAuditRateLimitMiddleware(limiter)(req, res, next)

    expect(next).toHaveBeenCalledWith()
    expect(limiter.consume).not.toHaveBeenCalled()
    expect(res.headers).toEqual({})
  })

  it('fails closed when the limiter throws without exposing the client key', () => {
    const req = { id: 'existing-request-id', ip: '203.0.113.10' }
    const res = createResponse()
    const next = vi.fn()
    const limiter = {
      consume: vi.fn(() => {
        throw new Error('internal limiter failed for 203.0.113.10')
      })
    }

    createAuditRateLimitMiddleware(limiter)(req, res, next)

    const error = next.mock.calls[0][0]
    expect(error).toMatchObject({
      code: 'RATE_LIMITER_UNAVAILABLE',
      statusCode: 503,
      publicMessage: 'Audit request limiting is temporarily unavailable.'
    })
    expect(error.publicMessage).not.toContain('203.0.113.10')
    expect(res.headers).toEqual({})
  })

  it('fails closed for malformed limiter decisions before setting headers', () => {
    const malformedWithSymbol = {
      allowed: true,
      limit: 3,
      remaining: 2,
      resetAt: Date.now() + 60000,
      retryAfterSeconds: 0,
      [Symbol('extra')]: true
    }
    const malformedWithHidden = {
      allowed: true,
      limit: 3,
      remaining: 2,
      resetAt: Date.now() + 60000,
      retryAfterSeconds: 0
    }
    Object.defineProperty(malformedWithHidden, 'hidden', {
      value: true,
      enumerable: false
    })
    const inheritedOnly = Object.create({
      allowed: true,
      limit: 3,
      remaining: 2,
      resetAt: Date.now() + 60000,
      retryAfterSeconds: 0
    })

    const malformedDecisions = [
      null,
      undefined,
      [],
      'decision',
      1,
      {},
      { allowed: true },
      { allowed: false },
      { allowed: true, limit: 0, remaining: 0, resetAt: Date.now() + 60000, retryAfterSeconds: 0 },
      { allowed: true, limit: 3.5, remaining: 0, resetAt: Date.now() + 60000, retryAfterSeconds: 0 },
      { allowed: true, limit: '3', remaining: 0, resetAt: Date.now() + 60000, retryAfterSeconds: 0 },
      { allowed: true, limit: 3, remaining: -1, resetAt: Date.now() + 60000, retryAfterSeconds: 0 },
      { allowed: true, limit: 3, remaining: 4, resetAt: Date.now() + 60000, retryAfterSeconds: 0 },
      { allowed: true, limit: 3, remaining: NaN, resetAt: Date.now() + 60000, retryAfterSeconds: 0 },
      { allowed: true, limit: 3, remaining: Infinity, resetAt: Date.now() + 60000, retryAfterSeconds: 0 },
      { allowed: true, limit: 3, remaining: 2, resetAt: -1, retryAfterSeconds: 0 },
      { allowed: true, limit: 3, remaining: 2, resetAt: 1.5, retryAfterSeconds: 0 },
      { allowed: true, limit: 3, remaining: 2, resetAt: Date.now() + 60000, retryAfterSeconds: -1 },
      { allowed: true, limit: 3, remaining: 2, resetAt: Date.now() + 60000, retryAfterSeconds: 1 },
      { allowed: false, limit: 3, remaining: 0, resetAt: Date.now() + 60000, retryAfterSeconds: 0 },
      { allowed: false, limit: 3, remaining: 1, resetAt: Date.now() + 60000, retryAfterSeconds: 1 },
      { allowed: true, limit: 3, remaining: 2, resetAt: Date.now() + 60000, retryAfterSeconds: 0, extra: true },
      malformedWithSymbol,
      malformedWithHidden,
      inheritedOnly
    ]

    for (const decision of malformedDecisions) {
      const req = { id: 'existing-request-id', ip: '203.0.113.10' }
      const res = createResponse()
      const next = vi.fn()

      createAuditRateLimitMiddleware({
        consume: vi.fn(() => decision)
      })(req, res, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(next.mock.calls[0][0]).toMatchObject({
        code: 'RATE_LIMITER_UNAVAILABLE',
        statusCode: 503,
        publicMessage: 'Audit request limiting is temporarily unavailable.'
      })
      expect(res.headers).toEqual({})
    }
  })
})
