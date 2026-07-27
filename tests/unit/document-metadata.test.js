import { describe, expect, it } from 'vitest'
import * as cheerio from 'cheerio'
import { analyseDocumentMetadata } from '../../src/analyzers/document-metadata.analyzer.js'

function analyse(html, finalUrl = 'https://example.com/path/page.html') {
  return analyseDocumentMetadata(cheerio.load(html), { finalUrl })
}

describe('document metadata analyzer', () => {
  it('passes valid title, description, canonical, viewport, and language metadata', () => {
    const result = analyse(`
      <html lang="en-US">
        <head>
          <title>Example Domain Page</title>
          <meta NAME="description" content="This is a useful page summary written for deterministic PagePulse tests.">
          <link REL="alternate canonical" href="/canonical">
          <meta NAME="viewport" content="width=device-width, initial-scale=1">
        </head>
      </html>
    `)

    expect(result.page).toEqual({
      title: 'Example Domain Page',
      metaDescription: 'This is a useful page summary written for deterministic PagePulse tests.',
      canonicalUrl: 'https://example.com/canonical',
      language: 'en-US'
    })
    expect(result.checks.title.status).toBe('pass')
    expect(result.checks.metaDescription.status).toBe('pass')
    expect(result.checks.canonical.status).toBe('pass')
    expect(result.checks.viewport.status).toBe('pass')
    expect(result.checks.htmlLang.status).toBe('pass')
    expect(result.issues).toEqual([])
  })

  it('handles title boundaries, duplicate titles, whitespace, and bounded exposure', () => {
    expect(analyse('<title></title>').checks.title.status).toBe('fail')
    expect(analyse('<title>123456789</title>').checks.title.status).toBe('warning')
    expect(analyse('<title>1234567890</title>').checks.title.status).toBe('pass')
    expect(analyse(`<title>${'a'.repeat(60)}</title>`).checks.title.status).toBe('pass')
    expect(analyse(`<title>${'a'.repeat(61)}</title>`).checks.title.status).toBe('warning')
    expect(analyse(`<title>${'a'.repeat(70)}</title>`).checks.title.status).toBe('warning')
    expect(analyse(`<title>${'a'.repeat(71)}</title>`).checks.title.status).toBe('warning')

    const duplicate = analyse(`<title>   </title><title>  ${'A '.repeat(200)} </title>`)

    expect(duplicate.page.title).toHaveLength(300)
    expect(duplicate.page.title).not.toContain('  ')
    expect(duplicate.checks.title.status).toBe('warning')
    expect(duplicate.issues.map((item) => item.code)).toContain('TITLE_TOO_LONG')

    const twoMeaningful = analyse('<title>First Meaningful</title><title>Second Meaningful</title>')
    expect(twoMeaningful.page.title).toBe('First Meaningful')

    const nestedAndEntities = analyse('<title>Nested <b>Markup</b> &amp; Entities 😀😀</title>')
    expect(nestedAndEntities.page.title).toBe('Nested <b>Markup</b> & Entities 😀😀')

    const longUnicode = analyse(`<title>${'😀'.repeat(301)}</title>`)
    expect(Array.from(longUnicode.page.title)).toHaveLength(300)
    expect(longUnicode.page.title.endsWith(String.fromCharCode(0xD83D))).toBe(false)
  })

  it('handles meta description boundaries case-insensitively and bounds exposure', () => {
    expect(analyse('<html></html>').checks.metaDescription.status).toBe('warning')
    expect(analyse('<meta name="description">').checks.metaDescription.status).toBe('warning')
    expect(analyse('<meta name="description" content="">').checks.metaDescription.status).toBe('warning')
    expect(analyse('<meta name="description" content="   ">').checks.metaDescription.status).toBe('warning')
    expect(analyse('<meta NAME="DESCRIPTION" content="Too short">').checks.metaDescription.status).toBe('warning')
    expect(analyse('<meta name=" Description " content="Too short">').checks.metaDescription.status).toBe('warning')
    expect(analyse(`<meta name="description" content="${'a'.repeat(49)}">`).checks.metaDescription.status).toBe('warning')
    expect(analyse(`<meta name="description" content="${'a'.repeat(50)}">`).checks.metaDescription.status).toBe('pass')
    expect(analyse(`<meta name="description" content="${'a'.repeat(160)}">`).checks.metaDescription.status).toBe('pass')
    expect(analyse(`<meta name="description" content="${'a'.repeat(161)}">`).checks.metaDescription.status).toBe('warning')

    const long = analyse(`<meta name="description" content="${'😀'.repeat(301)}">`)
    expect(long.checks.metaDescription.status).toBe('warning')
    expect(Array.from(long.page.metaDescription)).toHaveLength(300)
    expect(long.page.metaDescription.endsWith(String.fromCharCode(0xD83D))).toBe(false)

    const firstMeaningful = analyse(`
      <meta name="description" content=" ">
      <meta name="description" content="This meaningful description is comfortably inside the preferred length range.">
    `)
    expect(firstMeaningful.page.metaDescription).toBe('This meaningful description is comfortably inside the preferred length range.')

    const openGraphOnly = analyse('<meta property="og:description" content="This Open Graph description should be ignored.">')
    expect(openGraphOnly.page.metaDescription).toBeNull()
    expect(openGraphOnly.issues.map((item) => item.code)).toContain('MISSING_META_DESCRIPTION')
  })

  it('warns for canonical edge cases without fetching destinations', () => {
    expect(analyse('<html></html>').issues.map((item) => item.code)).toContain('MISSING_CANONICAL')
    expect(analyse('<link rel="canonical" href="">').issues.map((item) => item.code)).toContain('EMPTY_CANONICAL')
    expect(analyse('<link rel="canonical" href="   ">').issues.map((item) => item.code)).toContain('EMPTY_CANONICAL')
    expect(analyse('<link rel="canonical" href="http://[::1">').issues.map((item) => item.code)).toContain('INVALID_CANONICAL')
    expect(analyse('<link rel="canonical" href="ftp://example.com/file">').issues.map((item) => item.code)).toContain('INVALID_CANONICAL')
    expect(analyse('<link rel="canonical" href="file:///tmp/page.html">').issues.map((item) => item.code)).toContain('INVALID_CANONICAL')
    expect(analyse('<link rel="canonical" href="data:text/html,hello">').issues.map((item) => item.code)).toContain('INVALID_CANONICAL')
    expect(analyse('<link rel="canonical" href="javascript:alert(1)">').issues.map((item) => item.code)).toContain('INVALID_CANONICAL')
    expect(analyse('<link rel="canonical" href="https://user@example.com/">').issues.map((item) => item.code)).toContain('INVALID_CANONICAL')
    expect(analyse('<link rel="canonical" href="https://user:pass@example.com/">').issues.map((item) => item.code)).toContain('INVALID_CANONICAL')
    expect(analyse('<link rel="CANONICAL" href="https://example.com/upper">').page.canonicalUrl).toBe('https://example.com/upper')
    expect(analyse('<link rel="stylesheet canonical" href="https://example.com/token">').page.canonicalUrl).toBe('https://example.com/token')
    expect(analyse('<link rel=" stylesheet   canonical " href="https://example.com/space">').page.canonicalUrl).toBe('https://example.com/space')
    expect(analyse('<link rel="canonical" href="//cdn.example.com/page">').page.canonicalUrl).toBe('https://cdn.example.com/page')
    expect(analyse('<link rel="canonical" href="?q=1">').page.canonicalUrl).toBe('https://example.com/path/page.html?q=1')
    expect(analyse('<link rel="canonical" href="#section">').page.canonicalUrl).toBe('https://example.com/path/page.html')
    expect(analyse('<base href="https://attacker.example/"><link rel="canonical" href="/safe">').page.canonicalUrl).toBe('https://example.com/safe')

    const multiple = analyse(`
      <link rel="canonical" href="https://example.com/one">
      <link rel="canonical" href="https://example.com/two">
    `)
    expect(multiple.page.canonicalUrl).toBe('https://example.com/one')
    expect(multiple.issues.map((item) => item.code)).toContain('MULTIPLE_CANONICAL_TAGS')

    const firstEmptyMultiple = analyse(`
      <link rel="canonical" href="">
      <link rel="canonical" href="https://example.com/two">
    `)
    expect(firstEmptyMultiple.page.canonicalUrl).toBeNull()
    expect(firstEmptyMultiple.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      'EMPTY_CANONICAL',
      'MULTIPLE_CANONICAL_TAGS'
    ]))

    const exactlyAtLimit = analyse(`<link rel="canonical" href="https://example.com/${'a'.repeat(480)}">`)
    expect(exactlyAtLimit.page.canonicalUrl).toHaveLength(500)
    expect(exactlyAtLimit.issues.map((item) => item.code)).not.toContain('CANONICAL_URL_TOO_LONG')

    const overLimit = analyse(`<link rel="canonical" href="https://example.com/${'a'.repeat(481)}">`)
    expect(overLimit.page.canonicalUrl).toBeNull()
    expect(overLimit.checks.canonical.status).toBe('warning')
    expect(overLimit.issues.map((item) => item.code)).toContain('CANONICAL_URL_TOO_LONG')
  })

  it('warns for viewport and language edge cases with conservative language syntax', () => {
    for (const language of ['en', 'en-US', 'hi-IN', 'zh-Hant', 'pt-BR']) {
      expect(analyse(`<html lang="${language}"></html>`).checks.htmlLang.status).toBe('pass')
    }

    expect(analyse('<meta name="viewport" content="">').checks.viewport.status).toBe('warning')
    expect(analyse('<html></html>').issues.map((item) => item.code)).toContain('MISSING_HTML_LANG')
    expect(analyse('<html lang="not a language tag"></html>').issues.map((item) => item.code)).toContain('INVALID_HTML_LANG')
    expect(analyse(`<html lang="${'en-'.repeat(40)}"></html>`).page.language).toHaveLength(50)
  })
})
