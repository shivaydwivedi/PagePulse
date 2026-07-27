import * as cheerio from 'cheerio'
import { analyseDocumentMetadata } from '../analyzers/document-metadata.analyzer.js'
import { analyseHeadings } from '../analyzers/headings.analyzer.js'
import { analyseImages } from '../analyzers/images.analyzer.js'
import { analyseLinks } from '../analyzers/links.analyzer.js'
import { analyseSecurityHeaders } from '../analyzers/security-headers.analyzer.js'
import { AppError } from '../utils/errors.js'

function check(status, summary, details = {}) {
  return { status, summary, details }
}

function extractCharset(contentType) {
  if (typeof contentType !== 'string') {
    return null
  }

  const match = contentType.match(/(?:^|;)\s*charset=([^;]+)/i)
  return match ? match[1].trim().replace(/^"|"$/g, '').toLowerCase() : null
}

function decodeBody(body) {
  if (Buffer.isBuffer(body)) {
    return body.toString('utf8')
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString('utf8')
  }

  if (typeof body === 'string') {
    return body
  }

  return ''
}

function uniqueIssues(issues) {
  const seen = new Set()
  const unique = []

  for (const issue of issues) {
    if (!seen.has(issue.code)) {
      seen.add(issue.code)
      unique.push(issue)
    }
  }

  return unique
}

function upstreamStatusIssue(statusCode) {
  if (statusCode >= 400) {
    return {
      code: 'UPSTREAM_HTTP_STATUS',
      severity: 'warning',
      category: 'content',
      message: `The upstream server completed the request with HTTP ${statusCode}.`,
      suggestion: 'Review the page content and status code to confirm this URL is the intended audit target.'
    }
  }

  return null
}

export function createHtmlAnalysisService() {
  function analyse(transportResult) {
    let $
    const html = decodeBody(transportResult.body)
    const charset = extractCharset(transportResult.contentType)

    try {
      $ = cheerio.load(html, {
        scriptingEnabled: false
      })
    } catch (error) {
      throw new AppError({
        code: 'HTML_ANALYSIS_FAILED',
        message: 'The upstream HTML could not be analysed.',
        statusCode: 422,
        cause: error
      })
    }

    try {
      const https = new URL(transportResult.finalUrl).protocol === 'https:'
        ? {
            check: check('pass', 'The final URL uses HTTPS.', { finalProtocol: 'https:' }),
            issues: []
          }
        : {
            check: check('warning', 'The final URL uses HTTP.', { finalProtocol: 'http:' }),
            issues: [{
              code: 'INSECURE_HTTP',
              severity: 'warning',
              category: 'security',
              message: 'The final audited URL uses HTTP.',
              suggestion: 'Use HTTPS for the final page URL when available.'
            }]
          }

      const documentMetadata = analyseDocumentMetadata($, { finalUrl: transportResult.finalUrl })
      const headings = analyseHeadings($)
      const images = analyseImages($)
      const links = analyseLinks($, { finalUrl: transportResult.finalUrl })
      const securityHeaders = analyseSecurityHeaders(transportResult.headers, { finalUrl: transportResult.finalUrl })
      const upstreamIssue = upstreamStatusIssue(transportResult.statusCode)

      return {
        page: {
          title: documentMetadata.page.title,
          metaDescription: documentMetadata.page.metaDescription,
          canonicalUrl: documentMetadata.page.canonicalUrl,
          language: documentMetadata.page.language,
          headingCount: headings.page.headingCount,
          imageCount: images.page.imageCount,
          linkCount: links.page.linkCount
        },
        checks: {
          https: https.check,
          title: documentMetadata.checks.title,
          metaDescription: documentMetadata.checks.metaDescription,
          canonical: documentMetadata.checks.canonical,
          viewport: documentMetadata.checks.viewport,
          htmlLang: documentMetadata.checks.htmlLang,
          headings: headings.check,
          images: images.check,
          links: links.check,
          securityHeaders: securityHeaders.check
        },
        issues: uniqueIssues([
          ...(upstreamIssue ? [upstreamIssue] : []),
          ...https.issues,
          ...documentMetadata.issues,
          ...headings.issues,
          ...images.issues,
          ...links.issues,
          ...securityHeaders.issues
        ]),
        analysis: {
          charset,
          decoding: 'utf-8'
        }
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      throw new AppError({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        statusCode: 500,
        cause: error
      })
    }
  }

  return { analyse }
}
