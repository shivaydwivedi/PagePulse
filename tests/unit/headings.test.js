import { describe, expect, it } from 'vitest'
import * as cheerio from 'cheerio'
import { analyseHeadings } from '../../src/analyzers/headings.analyzer.js'

function analyse(html) {
  return analyseHeadings(cheerio.load(html))
}

describe('headings analyzer', () => {
  it('passes one non-empty H1 and reports counts without exposing heading text', () => {
    const result = analyse('<h1>Main page title</h1><h2>Section</h2>')

    expect(result.check.status).toBe('pass')
    expect(result.page.headingCount).toBe(2)
    expect(result.check.details).toMatchObject({
      total: 2,
      h1Count: 1,
      countsByLevel: { h1: 1, h2: 1, h3: 0, h4: 0, h5: 0, h6: 0 }
    })
    expect(JSON.stringify(result)).not.toContain('Main page title')
  })

  it('warns for missing H1, multiple H1, empty headings, skipped levels, and malformed nesting', () => {
    expect(analyse('<h2>Section</h2>').issues.map((item) => item.code)).toContain('MISSING_H1')
    expect(analyse('<h1>One</h1><h1>Two</h1>').issues.map((item) => item.code)).toContain('MULTIPLE_H1')
    expect(analyse('<h1>Main</h1><h2> </h2>').issues.map((item) => item.code)).toContain('EMPTY_HEADING')
    expect(analyse('<h1>Main</h1><h2>Section</h2><h4>Deep</h4>').issues.map((item) => item.code)).toContain('SKIPPED_HEADING_LEVEL')

    const malformed = analyse('<h1>Main<h3>Nested jump</h3>')
    expect(malformed.check.status).toBe('warning')
    expect(malformed.check.details.total).toBeGreaterThan(0)
  })
})

