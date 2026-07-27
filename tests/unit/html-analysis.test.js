import { describe, expect, it } from 'vitest'
import { createHtmlAnalysisService } from '../../src/services/html-analysis.service.js'

const service = createHtmlAnalysisService()

function transportResult(overrides = {}) {
  const html = overrides.html ?? `
    <!doctype html>
    <html lang="en">
      <head>
        <title>Example Domain Page</title>
        <meta name="description" content="This is a useful page summary written for deterministic PagePulse tests.">
        <link rel="canonical" href="https://example.com/">
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body>
        <h1>Example Domain</h1>
        <img src="/logo.png" alt="Logo">
        <a href="/about">About</a>
      </body>
    </html>
  `

  return {
    requestedUrl: 'https://example.com/',
    finalUrl: overrides.finalUrl ?? 'https://example.com/',
    statusCode: overrides.statusCode ?? 200,
    headers: overrides.headers ?? {
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin',
      'permissions-policy': 'geolocation=()'
    },
    contentType: overrides.contentType ?? 'text/html; charset=UTF-8',
    body: overrides.body ?? Buffer.from(html)
  }
}

describe('HTML analysis service', () => {
  it('analyses a healthy HTML document and preserves deterministic check order', () => {
    const result = service.analyse(transportResult())

    expect(result.page).toEqual({
      title: 'Example Domain Page',
      metaDescription: 'This is a useful page summary written for deterministic PagePulse tests.',
      canonicalUrl: 'https://example.com/',
      language: 'en',
      headingCount: 1,
      imageCount: 1,
      linkCount: 1
    })
    expect(Object.keys(result.checks)).toEqual([
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
    expect(result.issues).toEqual([])
    expect(result.analysis).toEqual({ charset: 'utf-8', decoding: 'utf-8' })
  })

  it('analyses malformed, missing-head, missing-body, empty, UTF-8, and invalid UTF-8 documents without crashing', () => {
    for (const body of [
      Buffer.from('<html><head><title>Broken<title></head><h1>Main'),
      Buffer.from('<html><body><h1>Main</h1></body></html>'),
      Buffer.from('<html><head><title>Only Head</title></head></html>'),
      Buffer.from(''),
      Buffer.from('<title>नमस्ते Example</title><h1>मुख्य</h1>'),
      Buffer.from([0xff, 0xfe, 0xfd, 0x3c, 0x68, 0x31, 0x3e])
    ]) {
      expect(() => service.analyse(transportResult({ body }))).not.toThrow()
    }
  })

  it('creates unique deterministic issues for warnings and failures without score or raw HTML', () => {
    const result = service.analyse(transportResult({
      statusCode: 404,
      finalUrl: 'http://example.com/',
      headers: {},
      html: '<html><head><title>Bad</title></head><body><h2>Skip</h2><img src="/a.png"><a href="javascript:alert(1)">Run</a></body></html>'
    }))

    expect(result.issues.map((item) => item.code)).toEqual([
      'UPSTREAM_HTTP_STATUS',
      'INSECURE_HTTP',
      'TITLE_TOO_SHORT',
      'MISSING_META_DESCRIPTION',
      'MISSING_CANONICAL',
      'MISSING_VIEWPORT',
      'MISSING_HTML_LANG',
      'MISSING_H1',
      'IMAGE_MISSING_ALT',
      'JAVASCRIPT_LINK',
      'MISSING_CONTENT_SECURITY_POLICY',
      'INVALID_X_CONTENT_TYPE_OPTIONS',
      'MISSING_X_FRAME_OPTIONS',
      'MISSING_REFERRER_POLICY',
      'MISSING_PERMISSIONS_POLICY'
    ])
    expect(new Set(result.issues.map((item) => item.code)).size).toBe(result.issues.length)
    expect(JSON.stringify(result)).not.toContain('<img')
    expect(result.score).toBeUndefined()
    expect(result.grade).toBeUndefined()
  })

  it('returns identical page, checks, and issues for repeated analysis of the same input', () => {
    const input = transportResult({
      statusCode: 404,
      headers: {},
      html: '<html><head><title>Bad</title></head><body><h2>Skip</h2><img src="/a.png"><a href="">Empty</a></body></html>'
    })
    const first = service.analyse(input)
    const second = service.analyse(input)

    expect(second.page).toEqual(first.page)
    expect(second.checks).toEqual(first.checks)
    expect(second.issues).toEqual(first.issues)
    expect(Object.keys(first.checks)).toEqual([
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
    expect(new Set(first.issues.map((item) => item.code)).size).toBe(first.issues.length)
  })

  it('adds upstream status issues for 4xx and 5xx but not 2xx', () => {
    expect(service.analyse(transportResult({ statusCode: 200 })).issues.map((item) => item.code)).not.toContain('UPSTREAM_HTTP_STATUS')
    expect(service.analyse(transportResult({ statusCode: 404 })).issues.map((item) => item.code)).toContain('UPSTREAM_HTTP_STATUS')
    expect(service.analyse(transportResult({ statusCode: 500 })).issues.map((item) => item.code)).toContain('UPSTREAM_HTTP_STATUS')
  })
})
