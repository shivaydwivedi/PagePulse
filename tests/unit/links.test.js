import { describe, expect, it } from 'vitest'
import * as cheerio from 'cheerio'
import { analyseLinks } from '../../src/analyzers/links.analyzer.js'

function analyse(html) {
  return analyseLinks(cheerio.load(html), { finalUrl: 'https://example.com/path/page.html' })
}

describe('links analyzer', () => {
  it('classifies link href values without fetching them', () => {
    const result = analyse(`
      <a>Missing href</a>
      <a href="">Empty</a>
      <a href="   ">Whitespace</a>
      <a href="javascript:alert(1)">Script</a>
      <a href="JAVASCRIPT:alert(1)">Upper script</a>
      <a href="mailto:test@example.com">Email</a>
      <a href="tel:+10000000000">Phone</a>
      <a href="#top">Fragment</a>
      <a href="?q=1">Query</a>
      <a href="/internal">Relative</a>
      <a href="//example.com/protocol-relative">Protocol relative</a>
      <a href="http://example.com/plain">Internal HTTP</a>
      <a href="https://example.com:8443/port">Different port</a>
      <a href="https://external.example/">External</a>
      <a href="https://user:pass@example.com/credentials">Credentials</a>
      <a href="https://bücher.example/">IDN</a>
      <a href="ftp://example.com/file">Unsupported</a>
      <a href="http://[::1">Malformed</a>
    `)

    expect(result.check.status).toBe('warning')
    expect(result.page.linkCount).toBe(18)
    expect(result.check.details).toMatchObject({
      totalAnchors: 18,
      anchorsWithHref: 17,
      anchorsMissingHref: 1,
      emptyHrefCount: 2,
      javascriptHrefCount: 2,
      mailtoCount: 1,
      telCount: 1,
      fragmentCount: 1,
      internalHttpCount: 4,
      externalHttpCount: 4,
      unsupportedProtocolCount: 2
    })
    expect(result.issues.map((item) => item.code)).toEqual(['EMPTY_LINK_HREF', 'JAVASCRIPT_LINK'])
  })

  it('ignores attacker-controlled base elements when classifying relative links', () => {
    const result = analyseLinks(cheerio.load(`
      <base href="https://attacker.example/">
      <a href="/account">Account</a>
    `), { finalUrl: 'https://example.com/page' })

    expect(result.check.details.internalHttpCount).toBe(1)
    expect(result.check.details.externalHttpCount).toBe(0)
  })
})
