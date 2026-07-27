function deepFreeze(value) {
  Object.freeze(value)

  for (const nestedValue of Object.values(value)) {
    if (nestedValue && typeof nestedValue === 'object' && !Object.isFrozen(nestedValue)) {
      deepFreeze(nestedValue)
    }
  }

  return value
}

export const scoringPolicy = deepFreeze({
  version: '1.0',
  checkOrder: [
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
  ],
  weights: {
    https: 10,
    title: 12,
    metaDescription: 10,
    canonical: 8,
    viewport: 8,
    htmlLang: 8,
    headings: 12,
    images: 8,
    links: 8,
    securityHeaders: 16
  },
  statusMultipliers: {
    pass: 1,
    warning: 0.5,
    fail: 0
  },
  notApplicableStatus: 'not_applicable',
  gradeBoundaries: [
    { minScore: 90, grade: 'A' },
    { minScore: 80, grade: 'B' },
    { minScore: 70, grade: 'C' },
    { minScore: 60, grade: 'D' },
    { minScore: 0, grade: 'F' }
  ]
})

