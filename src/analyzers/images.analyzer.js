function issue(code, message, suggestion) {
  return { code, severity: 'warning', category: 'accessibility', message, suggestion }
}

export function analyseImages($) {
  const images = $('img').toArray()
  let missingAltCount = 0
  let emptyAltCount = 0
  let nonEmptyAltCount = 0

  for (const element of images) {
    const alt = $(element).attr('alt')

    if (alt === undefined) {
      missingAltCount += 1
    } else if (alt.trim().length === 0) {
      emptyAltCount += 1
    } else {
      nonEmptyAltCount += 1
    }
  }

  const issues = missingAltCount > 0
    ? [issue(
        'IMAGE_MISSING_ALT',
        'One or more images are missing an alt attribute.',
        'Add alt attributes; use alt="" only for intentionally decorative images.'
      )]
    : []

  const status = images.length === 0
    ? 'not_applicable'
    : issues.length > 0 ? 'warning' : 'pass'

  return {
    page: { imageCount: images.length },
    check: {
      status,
      summary: images.length === 0
        ? 'The page does not include images.'
        : issues.length > 0
          ? 'Some images are missing alt attributes.'
          : 'Images have alt attributes.',
      details: {
        total: images.length,
        missingAltCount,
        emptyAltCount,
        nonEmptyAltCount
      }
    },
    issues
  }
}

