import { describe, expect, it } from 'vitest'
import { getMediaType, isSupportedHtmlContentType } from '../../src/utils/content-type.js'

describe('content type helpers', () => {
  it('accepts supported HTML content types', () => {
    for (const contentType of [
      'text/html',
      'text/html; charset=utf-8',
      'application/xhtml+xml',
      'application/xhtml+xml; charset=UTF-8',
      'TEXT/HTML; Charset=UTF-8'
    ]) {
      expect(isSupportedHtmlContentType(contentType)).toBe(true)
    }
  })

  it('rejects unsupported or malformed content types', () => {
    for (const contentType of [
      'application/json',
      'text/plain',
      'application/pdf',
      'image/png',
      'application/octet-stream',
      undefined,
      'not a content type'
    ]) {
      expect(isSupportedHtmlContentType(contentType)).toBe(false)
    }
  })

  it('extracts normalized media types', () => {
    expect(getMediaType('Text/HTML; charset=utf-8')).toBe('text/html')
  })
})
