import { describe, expect, it, vi } from 'vitest'
import { createAuditScorer, gradeScore } from '../../src/scoring/audit-scorer.js'
import { scoringPolicy } from '../../src/scoring/scoring-policy.js'

function checksWith(status = 'pass', overrides = {}) {
  return Object.fromEntries(scoringPolicy.checkOrder.map((checkName) => [
    checkName,
    {
      status: overrides[checkName] ?? status,
      summary: `${checkName} summary`,
      details: {
        text: checkName,
        nested: {
          value: `${checkName} detail`
        }
      }
    }
  ]))
}

function score(overrides = {}, status = 'pass') {
  return createAuditScorer().score(checksWith(status, overrides))
}

function expectInternalError(callback) {
  expect(callback).toThrow('An unexpected error occurred.')
}

function deepFreeze(value) {
  Object.freeze(value)

  for (const key of Reflect.ownKeys(value)) {
    const nestedValue = value[key]

    if (nestedValue && typeof nestedValue === 'object' && !Object.isFrozen(nestedValue)) {
      deepFreeze(nestedValue)
    }
  }

  return value
}

function decimalPlaces(value) {
  const decimal = String(value).split('.')[1]
  return decimal?.length ?? 0
}

describe('audit scorer', () => {
  it('scores approved all-pass, all-warning, all-fail, and not-applicable examples', () => {
    expect(score()).toMatchObject({
      score: 100,
      grade: 'A',
      earnedPoints: 100,
      possiblePoints: 100,
      excludedPoints: 0
    })
    expect(score({}, 'warning')).toMatchObject({
      score: 50,
      grade: 'F',
      earnedPoints: 50,
      possiblePoints: 100,
      excludedPoints: 0
    })
    expect(score({}, 'fail')).toMatchObject({
      score: 0,
      grade: 'F',
      earnedPoints: 0,
      possiblePoints: 100,
      excludedPoints: 0
    })
    expect(score({ images: 'not_applicable' })).toMatchObject({
      score: 100,
      grade: 'A',
      earnedPoints: 92,
      possiblePoints: 92,
      excludedPoints: 8
    })
  })

  it('scores single-check warning and failure examples using weights', () => {
    expect(score({ https: 'warning' })).toMatchObject({ score: 95, grade: 'A', earnedPoints: 95 })
    expect(score({ title: 'warning' })).toMatchObject({ score: 94, grade: 'A', earnedPoints: 94 })
    expect(score({ securityHeaders: 'warning' })).toMatchObject({ score: 92, grade: 'A', earnedPoints: 92 })
    expect(score({ title: 'fail' })).toMatchObject({ score: 88, grade: 'B', earnedPoints: 88 })
    expect(score({ title: 'warning', headings: 'warning' })).toMatchObject({
      score: 88,
      grade: 'B',
      earnedPoints: 88
    })
    expect(score({ title: 'warning', metaDescription: 'warning', canonical: 'warning' })).toMatchObject({
      score: 85,
      grade: 'B',
      earnedPoints: 85
    })
    expect(score({ images: 'not_applicable', canonical: 'not_applicable' })).toMatchObject({
      score: 100,
      grade: 'A',
      earnedPoints: 84,
      possiblePoints: 84,
      excludedPoints: 16
    })
  })

  it('returns a deterministic ten-entry breakdown with clean point totals', () => {
    const result = score({ images: 'not_applicable', title: 'warning' })

    expect(Object.keys(result.breakdown)).toEqual(scoringPolicy.checkOrder)
    expect(result.breakdown.images).toEqual({
      status: 'not_applicable',
      weight: 8,
      applicable: false,
      earnedPoints: 0
    })
    expect(result.breakdown.title).toEqual({
      status: 'warning',
      weight: 12,
      applicable: true,
      earnedPoints: 6
    })
    expect(result.possiblePoints + result.excludedPoints).toBe(100)
    expect(result.earnedPoints).toBeLessThanOrEqual(result.possiblePoints)
    expect(Object.is(result.earnedPoints, -0)).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/0000000001|999999999/)

    for (const points of [result.earnedPoints, result.possiblePoints, result.excludedPoints]) {
      expect(Number.isNaN(points)).toBe(false)
      expect(Number.isFinite(points)).toBe(true)
      expect(Object.is(points, -0)).toBe(false)
      expect(decimalPlaces(points)).toBeLessThanOrEqual(1)
    }
  })

  it('rounds ratios with normal mathematical rounding and clamps public score', () => {
    expect([
      [0.0049, 0],
      [0.005, 1],
      [0.0051, 1],
      [0.4949, 49],
      [0.495, 50],
      [0.4951, 50],
      [0.8949, 89],
      [0.895, 90],
      [0.8951, 90],
      [0.9949, 99],
      [0.995, 100],
      [0.9951, 100]
    ].map(([ratio, expectedScore]) => [ratio, Math.round(ratio * 100), expectedScore]))
      .toEqual([
        [0.0049, 0, 0],
        [0.005, 1, 1],
        [0.0051, 1, 1],
        [0.4949, 49, 49],
        [0.495, 50, 50],
        [0.4951, 50, 50],
        [0.8949, 89, 89],
        [0.895, 90, 90],
        [0.8951, 90, 90],
        [0.9949, 99, 99],
        [0.995, 100, 100],
        [0.9951, 100, 100]
      ])

    const customPolicy = {
      ...scoringPolicy,
      weights: {
        https: 49,
        title: 1,
        metaDescription: 50,
        canonical: 0,
        viewport: 0,
        htmlLang: 0,
        headings: 0,
        images: 0,
        links: 0,
        securityHeaders: 0
      }
    }
    const scorer = createAuditScorer({ policy: customPolicy })

    expect(scorer.score(checksWith('fail', { https: 'pass' }))).toMatchObject({
      earnedPoints: 49,
      possiblePoints: 100,
      score: 49
    })
    expect(scorer.score(checksWith('fail', { https: 'pass', title: 'warning' }))).toMatchObject({
      earnedPoints: 49.5,
      possiblePoints: 100,
      score: 50
    })
    expect(scorer.score(checksWith('fail', { metaDescription: 'pass', title: 'warning' }))).toMatchObject({
      earnedPoints: 50.5,
      possiblePoints: 100,
      score: 51
    })
  })

  it('returns deep-equal output repeatedly and does not mutate deeply frozen checks', () => {
    const checks = deepFreeze(checksWith('pass', { title: 'warning', images: 'not_applicable' }))
    const keysBefore = Reflect.ownKeys(checks)
    const before = structuredClone(checks)
    const first = createAuditScorer().score(checks)
    const second = createAuditScorer().score(checks)

    expect(second).toEqual(first)
    expect(checks).toEqual(before)
    expect(checks.title.details).toEqual(before.title.details)
    expect(Reflect.ownKeys(checks)).toEqual(keysBefore)
  })

  it('rejects malformed internal scorer input shapes safely', () => {
    expectInternalError(() => createAuditScorer().score())
    expectInternalError(() => createAuditScorer().score(null))
    expectInternalError(() => createAuditScorer().score([]))
    expectInternalError(() => createAuditScorer().score('checks'))
    expectInternalError(() => createAuditScorer().score({}))
    expectInternalError(() => {
      const checks = checksWith()
      delete checks.title
      createAuditScorer().score(checks)
    })
    expectInternalError(() => createAuditScorer().score({ ...checksWith(), title: undefined }))
    expectInternalError(() => createAuditScorer().score({ ...checksWith(), title: null }))
    expectInternalError(() => createAuditScorer().score({ ...checksWith(), title: 'pass' }))
    expectInternalError(() => createAuditScorer().score({ ...checksWith(), title: {} }))
    expectInternalError(() => createAuditScorer().score({ ...checksWith(), title: { status: 'unknown' } }))
    expectInternalError(() => createAuditScorer().score({ ...checksWith(), title: { status: 'PASS' } }))
    expectInternalError(() => createAuditScorer().score(checksWith('not_applicable')))
  })

  it('rejects every unknown own check key while ignoring inherited properties', () => {
    for (const key of ['performance', 'robots', 'accessibility', 'constructor']) {
      expectInternalError(() => createAuditScorer().score({ ...checksWith(), [key]: { status: 'pass' } }))
    }

    const symbolChecks = checksWith()
    symbolChecks[Symbol('performance')] = { status: 'pass' }
    expectInternalError(() => createAuditScorer().score(symbolChecks))

    const nonEnumerableChecks = checksWith()
    Object.defineProperty(nonEnumerableChecks, 'performance', {
      value: { status: 'pass' },
      enumerable: false
    })
    expectInternalError(() => createAuditScorer().score(nonEnumerableChecks))

    const protoChecks = checksWith()
    Object.defineProperty(protoChecks, '__proto__', {
      value: { status: 'pass' },
      enumerable: true
    })
    expectInternalError(() => createAuditScorer().score(protoChecks))

    const inheritedChecks = Object.create({
      performance: { status: 'fail' },
      title: { status: 'fail' }
    })
    Object.assign(inheritedChecks, checksWith())

    expect(createAuditScorer().score(inheritedChecks).score).toBe(100)

    const pollutedPrototypeChecks = Object.create({
      title: { status: 'fail' },
      robots: { status: 'fail' }
    })
    Object.assign(pollutedPrototypeChecks, checksWith('pass'))

    expect(createAuditScorer().score(pollutedPrototypeChecks)).toMatchObject({
      score: 100,
      grade: 'A',
      earnedPoints: 100
    })
  })

  it('ignores issue collections because scoring receives only checks', () => {
    const checks = checksWith('pass', { title: 'warning' })
    const scoreAnalysis = vi.fn((analysis) => createAuditScorer().score(analysis.checks))
    const variants = [
      { issues: [{ code: 'A', message: 'first', suggestion: 'fix', severity: 'warning' }] },
      {
        issues: [
          { code: 'B', message: 'second', suggestion: 'change', severity: 'fail' },
          { code: 'A', message: 'first', suggestion: 'fix', severity: 'warning' }
        ]
      },
      {
        issues: [
          { code: 'A', message: 'changed', suggestion: 'different', severity: 'info' },
          { code: 'A', message: 'changed', suggestion: 'different', severity: 'info' }
        ]
      },
      { issues: [{ code: 'UPSTREAM_HTTP_STATUS', message: 'Not found', suggestion: 'Review upstream.', severity: 'warning' }] },
      { issues: [] }
    ]

    const results = variants.map((variant) => scoreAnalysis({ checks, page: { title: 'Ignored' }, ...variant }))

    expect(results.every((result) => result.score === results[0].score)).toBe(true)
    expect(results.every((result) => result.grade === results[0].grade)).toBe(true)
    expect(scoreAnalysis).toHaveBeenCalledTimes(variants.length)
    for (const call of scoreAnalysis.mock.calls) {
      expect(call[0]).toHaveProperty('issues')
    }
  })

  it('uses only top-level check status, not summaries, details, page fields, or nested security-header data', () => {
    const clean = checksWith('pass', { title: 'warning', securityHeaders: 'pass' })
    const noisy = checksWith('pass', { title: 'warning', securityHeaders: 'pass' })
    noisy.title.summary = 'Changed title summary'
    noisy.title.details = { text: 'Different title text', title: 'Different page title' }
    noisy.canonical.details = { href: 'https://different.example/' }
    noisy.securityHeaders.details = {
      contentSecurityPolicy: { status: 'warning', issue: 'nested ignored' },
      strictTransportSecurity: { status: 'fail', issue: 'nested ignored' }
    }
    const pageA = { title: 'Original', canonicalUrl: 'https://example.com/' }
    const pageB = { title: 'Changed', canonicalUrl: 'https://different.example/', imageCount: 999 }

    expect(createAuditScorer().score(noisy)).toEqual(createAuditScorer().score(clean))
    expect(pageA).not.toEqual(pageB)
    expect(score({ securityHeaders: 'pass' })).toMatchObject({ score: 100, earnedPoints: 100 })
    expect(score({ securityHeaders: 'warning' })).toMatchObject({ score: 92, earnedPoints: 92 })
    expect(score({ securityHeaders: 'fail' })).toMatchObject({ score: 84, earnedPoints: 84 })
    expect(score({ securityHeaders: 'not_applicable' })).toMatchObject({
      score: 100,
      earnedPoints: 84,
      possiblePoints: 84,
      excludedPoints: 16
    })
  })

  it('grades exact public score boundaries and rejects invalid direct helper inputs', () => {
    expect(gradeScore(100)).toBe('A')
    expect(gradeScore(90)).toBe('A')
    expect(gradeScore(89)).toBe('B')
    expect(gradeScore(80)).toBe('B')
    expect(gradeScore(79)).toBe('C')
    expect(gradeScore(70)).toBe('C')
    expect(gradeScore(69)).toBe('D')
    expect(gradeScore(60)).toBe('D')
    expect(gradeScore(59)).toBe('F')
    expect(gradeScore(1)).toBe('F')
    expect(gradeScore(0)).toBe('F')

    for (const invalidScore of [-1, 101, NaN, Infinity, -Infinity, 89.5, '90', null, undefined]) {
      expectInternalError(() => gradeScore(invalidScore))
    }
  })

  it('rejects invalid policies safely', () => {
    const invalidPolicy = {
      ...scoringPolicy,
      weights: { ...scoringPolicy.weights, title: 13 }
    }

    expectInternalError(() => createAuditScorer({ policy: invalidPolicy }))
  })
})
