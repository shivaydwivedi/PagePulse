import { describe, expect, it } from 'vitest'
import { createTtlCache } from '../../src/infrastructure/cache/ttl-cache.js'

function createClock(start = 0) {
  let currentTime = start

  return {
    now: () => currentTime,
    advance: (ms) => {
      currentTime += ms
    }
  }
}

describe('ttl cache', () => {
  it('does not read, store, or count entries when disabled', () => {
    const clock = createClock()
    const cache = createTtlCache({ enabled: false, ttlMs: 1000, maxEntries: 2, clock: clock.now })

    cache.set('https://example.com/', { score: 100 })

    expect(cache.get('https://example.com/')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('clones values on set and get so mutations cannot alter stored entries', () => {
    const clock = createClock()
    const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 2, clock: clock.now })
    const original = {
      score: 100,
      scoring: {
        breakdown: {
          title: { status: 'pass', earnedPoints: 12 }
        }
      },
      checks: {
        title: { status: 'pass', details: { text: 'original' } }
      },
      issues: [{ code: 'A', message: 'first' }]
    }

    cache.set('https://example.com/', original)
    original.scoring.breakdown.title.earnedPoints = 0
    original.checks.title.details.text = 'changed'
    original.issues.push({ code: 'B', message: 'second' })

    const firstHit = cache.get('https://example.com/')
    firstHit.scoring.breakdown.title.earnedPoints = 1
    firstHit.checks.title.details.text = 'mutated hit'
    firstHit.issues.push({ code: 'C', message: 'third' })

    expect(cache.get('https://example.com/')).toEqual({
      score: 100,
      scoring: {
        breakdown: {
          title: { status: 'pass', earnedPoints: 12 }
        }
      },
      checks: {
        title: { status: 'pass', details: { text: 'original' } }
      },
      issues: [{ code: 'A', message: 'first' }]
    })
  })

  it('expires entries exactly at their expiry timestamp without extending TTL on hits', () => {
    const clock = createClock(100)
    const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 2, clock: clock.now })

    cache.set('https://example.com/', { score: 100 })
    clock.advance(999)
    expect(cache.get('https://example.com/')).toEqual({ score: 100 })
    clock.advance(1)
    expect(cache.get('https://example.com/')).toBeUndefined()
    expect(cache.size).toBe(0)
  })

  it('replacing an entry resets its TTL', () => {
    const clock = createClock()
    const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 2, clock: clock.now })

    cache.set('https://example.com/', { score: 90 })
    clock.advance(900)
    cache.set('https://example.com/', { score: 100 })
    clock.advance(999)

    expect(cache.get('https://example.com/')).toEqual({ score: 100 })
  })

  it('uses deterministic LRU eviction and removes expired entries before valid eviction', () => {
    const clock = createClock()
    const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 2, clock: clock.now })

    cache.set('https://example.com/a', { page: 'a' })
    cache.set('https://example.com/b', { page: 'b' })
    expect(cache.get('https://example.com/a')).toEqual({ page: 'a' })
    cache.set('https://example.com/c', { page: 'c' })

    expect(cache.size).toBe(2)
    expect(cache.get('https://example.com/b')).toBeUndefined()
    expect(cache.get('https://example.com/a')).toEqual({ page: 'a' })
    expect(cache.get('https://example.com/c')).toEqual({ page: 'c' })

    clock.advance(1000)
    cache.set('https://example.com/d', { page: 'd' })

    expect(cache.size).toBe(1)
    expect(cache.get('https://example.com/d')).toEqual({ page: 'd' })
  })

  it('supports explicit delete and clear operations', () => {
    const clock = createClock()
    const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 3, clock: clock.now })

    cache.set('https://example.com/a', { page: 'a' })
    cache.set('https://example.com/b', { page: 'b' })
    cache.delete('https://example.com/a')

    expect(cache.get('https://example.com/a')).toBeUndefined()
    expect(cache.get('https://example.com/b')).toEqual({ page: 'b' })

    cache.clear()
    expect(cache.size).toBe(0)
  })

  it('keeps distinct keys separate', () => {
    const clock = createClock()
    const cache = createTtlCache({ enabled: true, ttlMs: 1000, maxEntries: 5, clock: clock.now })

    cache.set('https://example.com/a', { page: 'a' })
    cache.set('https://example.com/b', { page: 'b' })
    cache.set('https://example.com/?a=1', { query: '1' })
    cache.set('https://example.com/?a=2', { query: '2' })

    expect(cache.get('https://example.com/a')).toEqual({ page: 'a' })
    expect(cache.get('https://example.com/b')).toEqual({ page: 'b' })
    expect(cache.get('https://example.com/?a=1')).toEqual({ query: '1' })
    expect(cache.get('https://example.com/?a=2')).toEqual({ query: '2' })
  })
})
