import { describe, expect, it } from 'vitest'
import { createFixedWindowRateLimiter } from '../../src/infrastructure/rate-limit/fixed-window-rate-limiter.js'

function createClock(start = 0) {
  let currentTime = start

  return {
    now: () => currentTime,
    advance(ms) {
      currentTime += ms
    }
  }
}

describe('fixed-window rate limiter', () => {
  it('allows everything and stores nothing when disabled', () => {
    const limiter = createFixedWindowRateLimiter({
      enabled: false,
      windowMs: 1000,
      maxRequests: 1,
      maxClients: 1,
      clock: () => 0
    })

    expect(limiter.enabled).toBe(false)
    expect(limiter.consume('client-a')).toEqual({
      allowed: true,
      limit: 1,
      remaining: 1,
      resetAt: 0,
      retryAfterSeconds: 0
    })
    expect(limiter.consume('client-a')).toEqual({
      allowed: true,
      limit: 1,
      remaining: 1,
      resetAt: 0,
      retryAfterSeconds: 0
    })
    expect(limiter.size).toBe(0)
  })

  it('uses fixed windows with capped rejected counts and non-sliding reset times', () => {
    const clock = createClock(100)
    const limiter = createFixedWindowRateLimiter({
      enabled: true,
      windowMs: 1000,
      maxRequests: 3,
      maxClients: 10,
      clock: clock.now
    })

    const first = limiter.consume('client-a')
    expect(first).toEqual({ allowed: true, limit: 3, remaining: 2, resetAt: 1100, retryAfterSeconds: 0 })

    clock.advance(200)
    expect(limiter.consume('client-a')).toEqual({ allowed: true, limit: 3, remaining: 1, resetAt: 1100, retryAfterSeconds: 0 })
    clock.advance(200)
    expect(limiter.consume('client-a')).toEqual({ allowed: true, limit: 3, remaining: 0, resetAt: 1100, retryAfterSeconds: 0 })
    clock.advance(200)
    expect(limiter.consume('client-a')).toEqual({
      allowed: false,
      limit: 3,
      remaining: 0,
      resetAt: 1100,
      retryAfterSeconds: 1
    })
    expect(limiter.consume('client-a')).toEqual({
      allowed: false,
      limit: 3,
      remaining: 0,
      resetAt: 1100,
      retryAfterSeconds: 1
    })
  })

  it('keeps entries valid before reset and starts a new window exactly at reset', () => {
    const clock = createClock(0)
    const limiter = createFixedWindowRateLimiter({
      enabled: true,
      windowMs: 1000,
      maxRequests: 1,
      maxClients: 10,
      clock: clock.now
    })

    expect(limiter.consume('client-a')).toMatchObject({ allowed: true, remaining: 0, resetAt: 1000 })
    clock.advance(999)
    expect(limiter.consume('client-a')).toMatchObject({ allowed: false, remaining: 0, resetAt: 1000 })
    clock.advance(1)
    expect(limiter.consume('client-a')).toMatchObject({ allowed: true, remaining: 0, resetAt: 2000 })
  })

  it('keeps separate client windows independent', () => {
    const clock = createClock()
    const limiter = createFixedWindowRateLimiter({
      enabled: true,
      windowMs: 1000,
      maxRequests: 1,
      maxClients: 10,
      clock: clock.now
    })

    expect(limiter.consume('client-a').allowed).toBe(true)
    expect(limiter.consume('client-a').allowed).toBe(false)
    expect(limiter.consume('client-b').allowed).toBe(true)

    clock.advance(1000)
    expect(limiter.consume('client-a').allowed).toBe(true)
    expect(limiter.consume('client-b').allowed).toBe(true)
  })

  it('bounds storage, removes expired buckets lazily, and evicts least recently seen clients', () => {
    const clock = createClock()
    const limiter = createFixedWindowRateLimiter({
      enabled: true,
      windowMs: 1000,
      maxRequests: 1,
      maxClients: 2,
      clock: clock.now
    })

    limiter.consume('client-a')
    limiter.consume('client-b')
    expect(limiter.consume('client-a').allowed).toBe(false)
    limiter.consume('client-c')

    expect(limiter.size).toBe(2)
    expect(limiter.consume('client-b').allowed).toBe(true)
    expect(limiter.consume('client-a').allowed).toBe(true)

    clock.advance(1000)
    limiter.consume('client-d')
    expect(limiter.size).toBe(1)
  })

  it('updates recency for rejected requests and allows evicted clients to start fresh windows', () => {
    const limiter = createFixedWindowRateLimiter({
      enabled: true,
      windowMs: 1000,
      maxRequests: 1,
      maxClients: 2,
      clock: () => 0
    })

    limiter.consume('client-a')
    limiter.consume('client-b')
    expect(limiter.consume('client-a').allowed).toBe(false)
    limiter.consume('client-c')

    expect(limiter.consume('client-b').allowed).toBe(true)
    expect(limiter.size).toBe(2)
  })
})
