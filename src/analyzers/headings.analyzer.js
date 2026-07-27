import { normalizeWhitespace } from '../utils/text.js'

function issue(code, message, suggestion) {
  return { code, severity: 'warning', category: 'content', message, suggestion }
}

export function analyseHeadings($) {
  const countsByLevel = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 }
  let emptyHeadingCount = 0
  let skippedLevelCount = 0
  let previousLevel = 0
  let nonEmptyH1Count = 0

  $('h1,h2,h3,h4,h5,h6').each((_, element) => {
    const tagName = element.tagName.toLowerCase()
    const level = Number(tagName.slice(1))
    const text = normalizeWhitespace($(element).text())

    countsByLevel[tagName] += 1

    if (!text) {
      emptyHeadingCount += 1
    }

    if (level === 1 && text) {
      nonEmptyH1Count += 1
    }

    if (previousLevel > 0 && level > previousLevel + 1) {
      skippedLevelCount += 1
    }

    previousLevel = level
  })

  const total = Object.values(countsByLevel).reduce((sum, count) => sum + count, 0)
  const issues = []

  if (nonEmptyH1Count === 0) {
    issues.push(issue(
      'MISSING_H1',
      'The page does not include a non-empty H1 heading.',
      'Add one clear H1 that describes the page.'
    ))
  } else if (nonEmptyH1Count > 1) {
    issues.push(issue(
      'MULTIPLE_H1',
      'The page includes multiple non-empty H1 headings.',
      'Use one primary H1 where possible and structure subtopics with lower heading levels.'
    ))
  }

  if (emptyHeadingCount > 0) {
    issues.push(issue(
      'EMPTY_HEADING',
      'The page includes empty heading elements.',
      'Remove empty headings or provide meaningful heading text.'
    ))
  }

  if (skippedLevelCount > 0) {
    issues.push(issue(
      'SKIPPED_HEADING_LEVEL',
      'The heading structure skips one or more levels.',
      'Avoid jumps such as H2 to H4 when structuring content.'
    ))
  }

  return {
    page: { headingCount: total },
    check: {
      status: issues.length > 0 ? 'warning' : 'pass',
      summary: issues.length > 0
        ? 'The page heading structure has warnings.'
        : 'The page heading structure has one primary H1 and no detected structural warnings.',
      details: {
        total,
        h1Count: nonEmptyH1Count,
        countsByLevel,
        emptyHeadingCount,
        skippedLevelCount
      }
    },
    issues
  }
}

