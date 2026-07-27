import { findLinksByRelToken, findMetaByName } from '../utils/html-attributes.js'
import { boundedText, normalizeWhitespace } from '../utils/text.js'

const canonicalUrlPublicMaxLength = 500

function check(status, summary, details = {}) {
  return { status, summary, details }
}

function issue(code, category, message, suggestion, severity = 'warning') {
  return { code, severity, category, message, suggestion }
}

function analyseTitle($) {
  const title = $('title')
    .toArray()
    .map((element) => boundedText($(element).text()))
    .find((value) => value.length > 0) ?? null

  if (!title) {
    return {
      title: null,
      check: check('fail', 'The page does not define a document title.', { length: 0 }),
      issues: [issue(
        'MISSING_TITLE',
        'seo',
        'The page does not define a document title.',
        'Add a concise and descriptive <title> element.',
        'error'
      )]
    }
  }

  if (title.length < 10) {
    return {
      title,
      check: check('warning', 'The document title is shorter than the recommended range.', { length: title.length }),
      issues: [issue(
        'TITLE_TOO_SHORT',
        'seo',
        'The document title is very short.',
        'Use a descriptive title between 10 and 60 characters when possible.'
      )]
    }
  }

  if (title.length > 60) {
    return {
      title,
      check: check('warning', 'The document title is longer than the preferred range.', { length: title.length }),
      issues: [issue(
        'TITLE_TOO_LONG',
        'seo',
        'The document title is longer than the preferred range.',
        'Keep the title concise while preserving the page meaning.'
      )]
    }
  }

  return {
    title,
    check: check('pass', 'The document title is present and within the preferred range.', { length: title.length }),
    issues: []
  }
}

function analyseMetaDescription($) {
  const description = findMetaByName($, 'description')
    .toArray()
    .map((element) => boundedText($(element).attr('content')))
    .find((value) => value.length > 0) ?? null

  if (!description) {
    return {
      metaDescription: null,
      check: check('warning', 'The page does not define a meta description.', { length: 0 }),
      issues: [issue(
        'MISSING_META_DESCRIPTION',
        'seo',
        'The page does not define a meta description.',
        'Add a concise meta description that summarises the page.'
      )]
    }
  }

  if (description.length < 50) {
    return {
      metaDescription: description,
      check: check('warning', 'The meta description is shorter than the preferred range.', { length: description.length }),
      issues: [issue(
        'META_DESCRIPTION_TOO_SHORT',
        'seo',
        'The meta description is very short.',
        'Use a descriptive meta description between 50 and 160 characters when possible.'
      )]
    }
  }

  if (description.length > 160) {
    return {
      metaDescription: description,
      check: check('warning', 'The meta description is longer than the preferred range.', { length: description.length }),
      issues: [issue(
        'META_DESCRIPTION_TOO_LONG',
        'seo',
        'The meta description is longer than the preferred range.',
        'Keep the meta description concise while preserving useful context.'
      )]
    }
  }

  return {
    metaDescription: description,
    check: check('pass', 'The meta description is present and within the preferred range.', { length: description.length }),
    issues: []
  }
}

function resolveCanonicalUrl(href, finalUrl) {
  const resolved = new URL(href, finalUrl)

  if (!['http:', 'https:'].includes(resolved.protocol)) {
    return { error: 'unsupported_protocol' }
  }

  if (resolved.username || resolved.password) {
    return { error: 'credentials_present' }
  }

  resolved.hash = ''
  return { url: resolved.toString() }
}

function analyseCanonical($, finalUrl) {
  const canonicalTags = findLinksByRelToken($, 'canonical').toArray()
  const issues = []

  if (canonicalTags.length === 0) {
    return {
      canonicalUrl: null,
      check: check('warning', 'The page does not define a canonical URL.', { present: false, count: 0 }),
      issues: [issue(
        'MISSING_CANONICAL',
        'seo',
        'The page does not define a canonical URL.',
        'Add one canonical link element that identifies the preferred URL.'
      )]
    }
  }

  const href = normalizeWhitespace($(canonicalTags[0]).attr('href'))
  let canonicalUrl = null
  let status = 'pass'
  let summary = 'The canonical URL is valid.'
  let reason = null

  if (!href) {
    status = 'warning'
    summary = 'The canonical link has an empty href.'
    reason = 'empty_href'
    issues.push(issue(
      'EMPTY_CANONICAL',
      'seo',
      'The canonical link has an empty href.',
      'Provide a valid HTTP or HTTPS canonical URL.'
    ))
  } else {
    try {
      const resolved = resolveCanonicalUrl(href, finalUrl)
      if (resolved.error) {
        status = 'warning'
        summary = 'The canonical URL is not a supported HTTP or HTTPS URL.'
        reason = resolved.error
        issues.push(issue(
          'INVALID_CANONICAL',
          'seo',
          'The canonical URL is not usable.',
          'Use a valid HTTP or HTTPS canonical URL without embedded credentials.'
        ))
      } else {
        if (Array.from(resolved.url).length > canonicalUrlPublicMaxLength) {
          status = 'warning'
          summary = 'The canonical URL is too long to expose safely.'
          reason = 'url_too_long'
          issues.push(issue(
            'CANONICAL_URL_TOO_LONG',
            'seo',
            'The canonical URL is too long to expose safely.',
            'Use a shorter canonical URL that clearly identifies the preferred page.'
          ))
        } else {
          canonicalUrl = resolved.url
        }
      }
    } catch {
      status = 'warning'
      summary = 'The canonical URL is malformed.'
      reason = 'malformed_url'
      issues.push(issue(
        'INVALID_CANONICAL',
        'seo',
        'The canonical URL is malformed.',
        'Use a valid absolute URL or a resolvable relative URL.'
      ))
    }
  }

  if (canonicalTags.length > 1) {
    status = 'warning'
    summary = 'The page defines multiple canonical links.'
    issues.push(issue(
      'MULTIPLE_CANONICAL_TAGS',
      'seo',
      'The page defines multiple canonical links.',
      'Keep exactly one canonical link element.'
    ))
  }

  return {
    canonicalUrl,
    check: check(status, summary, {
      present: true,
      count: canonicalTags.length,
      canonicalUrl,
      reason
    }),
    issues
  }
}

function analyseViewport($) {
  const viewport = findMetaByName($, 'viewport')
    .toArray()
    .map((element) => normalizeWhitespace($(element).attr('content')))
    .find((value) => value.length > 0)

  if (!viewport) {
    return {
      check: check('warning', 'The page does not define a meaningful viewport meta tag.', { present: false }),
      issues: [issue(
        'MISSING_VIEWPORT',
        'accessibility',
        'The page does not define a meaningful viewport meta tag.',
        'Add a viewport meta tag for responsive rendering.'
      )]
    }
  }

  return {
    check: check('pass', 'The page defines a viewport meta tag.', { present: true }),
    issues: []
  }
}

function isPlausibleLanguage(value) {
  return /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,3}$/i.test(value)
}

function analyseHtmlLang($) {
  const language = boundedText($('html').first().attr('lang'), 50) || null

  if (!language) {
    return {
      language: null,
      check: check('warning', 'The html element does not define a language.', { language: null }),
      issues: [issue(
        'MISSING_HTML_LANG',
        'accessibility',
        'The html element does not define a language.',
        'Add a plausible lang attribute such as en or en-US.'
      )]
    }
  }

  if (!isPlausibleLanguage(language)) {
    return {
      language,
      check: check('warning', 'The html lang value is not syntactically plausible.', { language }),
      issues: [issue(
        'INVALID_HTML_LANG',
        'accessibility',
        'The html lang value is not syntactically plausible.',
        'Use a conservative language tag such as en, en-US, hi-IN, or zh-Hant.'
      )]
    }
  }

  return {
    language,
    check: check('pass', 'The html element defines a plausible language.', { language }),
    issues: []
  }
}

export function analyseDocumentMetadata($, { finalUrl }) {
  const title = analyseTitle($)
  const metaDescription = analyseMetaDescription($)
  const canonical = analyseCanonical($, finalUrl)
  const viewport = analyseViewport($)
  const htmlLang = analyseHtmlLang($)

  return {
    page: {
      title: title.title,
      metaDescription: metaDescription.metaDescription,
      canonicalUrl: canonical.canonicalUrl,
      language: htmlLang.language
    },
    checks: {
      title: title.check,
      metaDescription: metaDescription.check,
      canonical: canonical.check,
      viewport: viewport.check,
      htmlLang: htmlLang.check
    },
    issues: [
      ...title.issues,
      ...metaDescription.issues,
      ...canonical.issues,
      ...viewport.issues,
      ...htmlLang.issues
    ]
  }
}
