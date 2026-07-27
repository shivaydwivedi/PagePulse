import { describe, expect, it } from 'vitest'
import * as cheerio from 'cheerio'
import { analyseImages } from '../../src/analyzers/images.analyzer.js'

function analyse(html) {
  return analyseImages(cheerio.load(html))
}

describe('images analyzer', () => {
  it('uses not_applicable for pages without images', () => {
    const result = analyse('<p>No images here.</p>')

    expect(result.check.status).toBe('not_applicable')
    expect(result.page.imageCount).toBe(0)
  })

  it('accepts non-empty and decorative alt text but warns once for missing alt attributes', () => {
    const result = analyse('<img src="/a.png" ALT="Logo"><img src="/b.png" alt=""><img src="/space.png" alt="   "><img src="/c.png"><img src="/d.png"><template><img src="/template.png"></template><img src="/broken.png"')

    expect(result.check.status).toBe('warning')
    expect(result.check.details).toEqual({
      total: 6,
      missingAltCount: 3,
      emptyAltCount: 2,
      nonEmptyAltCount: 1
    })
    expect(result.issues.map((item) => item.code)).toEqual(['IMAGE_MISSING_ALT'])
  })
})
