import { describe, expect, it } from 'vitest'
import { createAuditScorer } from '../../src/scoring/audit-scorer.js'
import { scoringPolicy } from '../../src/scoring/scoring-policy.js'

describe('scoring policy', () => {
  it('defines the approved check order, weights, multipliers, version, and grade boundaries', () => {
    expect(scoringPolicy.checkOrder).toEqual([
      'https',
      'title',
      'metaDescription',
      'canonical',
      'viewport',
      'htmlLang',
      'headings',
      'images',
      'links',
      'securityHeaders'
    ])
    expect(scoringPolicy.weights).toEqual({
      https: 10,
      title: 12,
      metaDescription: 10,
      canonical: 8,
      viewport: 8,
      htmlLang: 8,
      headings: 12,
      images: 8,
      links: 8,
      securityHeaders: 16
    })
    expect(Object.values(scoringPolicy.weights).reduce((sum, weight) => sum + weight, 0)).toBe(100)
    expect(scoringPolicy.statusMultipliers).toEqual({ pass: 1, warning: 0.5, fail: 0 })
    expect(scoringPolicy.version).toBe('1.0')
    expect(scoringPolicy.gradeBoundaries).toEqual([
      { minScore: 90, grade: 'A' },
      { minScore: 80, grade: 'B' },
      { minScore: 70, grade: 'C' },
      { minScore: 60, grade: 'D' },
      { minScore: 0, grade: 'F' }
    ])
  })

  it('freezes policy objects so mutation attempts do not affect later scoring', () => {
    expect(Object.isFrozen(scoringPolicy)).toBe(true)
    expect(Object.isFrozen(scoringPolicy.checkOrder)).toBe(true)
    expect(Object.isFrozen(scoringPolicy.weights)).toBe(true)
    expect(Object.isFrozen(scoringPolicy.statusMultipliers)).toBe(true)
    expect(Object.isFrozen(scoringPolicy.gradeBoundaries)).toBe(true)
    for (const boundary of scoringPolicy.gradeBoundaries) {
      expect(Object.isFrozen(boundary)).toBe(true)
    }

    const checks = Object.fromEntries(scoringPolicy.checkOrder.map((checkName) => [
      checkName,
      { status: 'pass' }
    ]))
    const before = createAuditScorer().score(checks)

    const mutationAttempts = [
      () => {
        scoringPolicy.weights.title = 100
      },
      () => {
        scoringPolicy.weights.performance = 5
      },
      () => {
        delete scoringPolicy.weights.title
      },
      () => {
        scoringPolicy.statusMultipliers.warning = 1
      },
      () => {
        scoringPolicy.statusMultipliers.fail = 0.5
      },
      () => {
        scoringPolicy.checkOrder.reverse()
      },
      () => {
        scoringPolicy.checkOrder.push('performance')
      },
      () => {
        scoringPolicy.gradeBoundaries[0].minScore = 95
      },
      () => {
        scoringPolicy.gradeBoundaries.push({ minScore: 50, grade: 'E' })
      },
      () => {
        scoringPolicy.version = '2.0'
      }
    ]

    for (const attemptMutation of mutationAttempts) {
      expect(attemptMutation).toThrow()
    }

    expect(createAuditScorer().score(checks)).toEqual(before)
    expect(scoringPolicy.weights.title).toBe(12)
    expect(scoringPolicy.statusMultipliers).toEqual({ pass: 1, warning: 0.5, fail: 0 })
    expect(scoringPolicy.checkOrder).toEqual([
      'https',
      'title',
      'metaDescription',
      'canonical',
      'viewport',
      'htmlLang',
      'headings',
      'images',
      'links',
      'securityHeaders'
    ])
    expect(scoringPolicy.gradeBoundaries).toEqual([
      { minScore: 90, grade: 'A' },
      { minScore: 80, grade: 'B' },
      { minScore: 70, grade: 'C' },
      { minScore: 60, grade: 'D' },
      { minScore: 0, grade: 'F' }
    ])
    expect(Object.values(scoringPolicy.weights).reduce((sum, weight) => sum + weight, 0)).toBe(100)
    expect(scoringPolicy.version).toBe('1.0')
  })
})
