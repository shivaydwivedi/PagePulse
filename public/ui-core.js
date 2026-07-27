export const checkLabels = {
  https: 'HTTPS',
  title: 'Title',
  metaDescription: 'Meta description',
  canonical: 'Canonical URL',
  viewport: 'Viewport',
  htmlLang: 'HTML language',
  headings: 'Headings',
  images: 'Images',
  links: 'Links',
  securityHeaders: 'Security headers'
}

export const checkOrder = Object.keys(checkLabels)
export const validThemes = new Set(['light', 'dark', 'system'])
export const validGrades = new Set(['A', 'B', 'C', 'D', 'F'])
export const validCheckStatuses = new Set(['pass', 'warning', 'fail', 'not_applicable'])
export const validAuditStatuses = new Set(['complete'])
export const maxRetryAfterSeconds = 60 * 60

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumberInRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max
}

function isFiniteNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function hasValidDateString(value) {
  return isNonEmptyString(value) && !Number.isNaN(new Date(value).getTime())
}

function isSafePrimitive(value) {
  return value === null ||
    value === undefined ||
    ['string', 'number', 'boolean'].includes(typeof value)
}

function isValidDetails(value) {
  if (value === undefined) return true
  if (!isPlainObject(value)) return false
  return Object.values(value).every((item) => {
    if (Array.isArray(item)) {
      return item.every(isSafePrimitive)
    }

    return isSafePrimitive(item)
  })
}

function isValidCheck(value) {
  return isPlainObject(value) &&
    validCheckStatuses.has(value.status) &&
    isNonEmptyString(value.summary) &&
    isValidDetails(value.details)
}

function isValidScoringBreakdownEntry(value) {
  return isPlainObject(value) &&
    validCheckStatuses.has(value.status) &&
    typeof value.applicable === 'boolean' &&
    isFiniteNonNegativeNumber(value.earnedPoints) &&
    isFiniteNonNegativeNumber(value.weight)
}

function isValidScoring(value) {
  if (!isPlainObject(value) ||
    !isNonEmptyString(value.scoringPolicyVersion) ||
    !isFiniteNonNegativeNumber(value.earnedPoints) ||
    !isFiniteNonNegativeNumber(value.possiblePoints) ||
    !isFiniteNonNegativeNumber(value.excludedPoints) ||
    !isPlainObject(value.breakdown)) {
    return false
  }

  return checkOrder.every((key) => isValidScoringBreakdownEntry(value.breakdown[key]))
}

function isValidIssue(value) {
  return isPlainObject(value) &&
    (value.code === undefined || isNonEmptyString(value.code)) &&
    (value.severity === undefined || isNonEmptyString(value.severity)) &&
    (value.category === undefined || isNonEmptyString(value.category)) &&
    (value.message === undefined || isNonEmptyString(value.message)) &&
    (value.suggestion === undefined || isNonEmptyString(value.suggestion))
}

function isValidAuditData(data) {
  if (!isPlainObject(data) ||
    !isFiniteNumberInRange(data.score, 0, 100) ||
    !validGrades.has(data.grade) ||
    !isNonEmptyString(data.requestedUrl) ||
    !isNonEmptyString(data.finalUrl) ||
    !hasValidDateString(data.auditedAt) ||
    data.auditStatus !== 'complete' ||
    typeof data.cached !== 'boolean' ||
    !isNonNegativeInteger(data.httpStatus) ||
    !isNonNegativeInteger(data.redirectCount) ||
    !isFiniteNonNegativeNumber(data.responseTimeMs) ||
    !isNonEmptyString(data.contentType) ||
    !isNonNegativeInteger(data.responseSizeBytes) ||
    !isPlainObject(data.checks) ||
    !Array.isArray(data.issues) ||
    !isValidScoring(data.scoring)) {
    return false
  }

  return checkOrder.every((key) => isValidCheck(data.checks[key])) &&
    data.issues.every(isValidIssue)
}

export function validateSuccessEnvelope(body) {
  if (!isPlainObject(body) || body.success !== true || !isValidAuditData(body.data)) {
    return { valid: false }
  }

  return { valid: true, data: body.data, requestId: typeof body.requestId === 'string' ? body.requestId : '' }
}

function readPositiveSeconds(value) {
  if (value === undefined || value === null || value === '') return 0
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.min(Math.ceil(seconds), maxRetryAfterSeconds)
}

export function getRetryAfterSeconds(headers = {}, body = null) {
  const headerSeconds = readPositiveSeconds(headers.retryAfter)
  if (headerSeconds > 0) return headerSeconds

  const detailSeconds = readPositiveSeconds(body?.error?.details?.find?.((detail) => (
    isPlainObject(detail) && Object.hasOwn(detail, 'retryAfterSeconds')
  ))?.retryAfterSeconds)

  return detailSeconds > 0 ? detailSeconds : 0
}

export function normaliseThemeMode(mode) {
  return validThemes.has(mode) ? mode : 'system'
}
