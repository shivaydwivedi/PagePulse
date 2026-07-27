import { describe, expect, it, vi } from 'vitest'
import { prepareAuditRequest } from '../../src/services/audit.service.js'
import { createAuditScorer } from '../../src/scoring/audit-scorer.js'
import { scoringPolicy } from '../../src/scoring/scoring-policy.js'

function checksWith(status = 'pass', overrides = {}) {
  return Object.fromEntries(scoringPolicy.checkOrder.map((checkName) => [
    checkName,
    {
      status: overrides[checkName] ?? status,
      summary: `${checkName} summary`,
      details: {
        text: checkName
      }
    }
  ]))
}

function transportResult() {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    statusCode: 200,
    headers: {},
    contentType: 'text/html',
    responseSizeBytes: 100,
    responseTimeMs: 10,
    redirectCount: 0,
    auditedAt: '2026-07-27T00:00:00.000Z',
    body: Buffer.from('<html></html>')
  }
}

describe('audit service scoring orchestration', () => {
  it('passes only analyser checks to the scorer so issues and page metadata do not influence score', async () => {
    const checks = checksWith('pass', { title: 'warning' })
    const scorer = createAuditScorer()
    const scoreSpy = vi.fn((receivedChecks) => scorer.score(receivedChecks))
    const issueVariants = [
      [{ code: 'A', message: 'first', suggestion: 'fix', severity: 'warning' }],
      [
        { code: 'B', message: 'second', suggestion: 'change', severity: 'fail' },
        { code: 'A', message: 'first', suggestion: 'fix', severity: 'warning' }
      ],
      [
        { code: 'A', message: 'changed', suggestion: 'different', severity: 'info' },
        { code: 'A', message: 'changed', suggestion: 'different', severity: 'info' }
      ],
      [{ code: 'UPSTREAM_HTTP_STATUS', message: 'Not found', suggestion: 'Review upstream.', severity: 'warning' }],
      []
    ]

    const results = []

    for (const [index, issues] of issueVariants.entries()) {
      const result = await prepareAuditRequest({ url: 'https://example.com' }, {
        auditHttpClient: {
          fetchAuditTarget: vi.fn(async () => transportResult())
        },
        htmlAnalysisService: {
          analyse: vi.fn(() => ({
            page: {
              title: `Variant ${index}`,
              canonicalUrl: `https://example.com/${index}`
            },
            checks,
            issues
          }))
        },
        auditScorer: {
          score: scoreSpy
        }
      })

      results.push(result.scoringResult)
    }

    expect(results.every((result) => result.score === results[0].score)).toBe(true)
    expect(results.every((result) => result.grade === results[0].grade)).toBe(true)
    expect(scoreSpy).toHaveBeenCalledTimes(issueVariants.length)
    for (const call of scoreSpy.mock.calls) {
      expect(call[0]).toBe(checks)
    }
  })
})
