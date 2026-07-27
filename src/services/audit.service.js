import { normalizeAuditUrl } from '../utils/normalize-url.js'
import { validateAuditRequestBody } from '../validators/audit.validator.js'

const auditPayloadKeys = [
  'requestedUrl',
  'finalUrl',
  'httpStatus',
  'redirectCount',
  'responseTimeMs',
  'contentType',
  'responseSizeBytes',
  'auditedAt',
  'auditStatus',
  'score',
  'grade',
  'scoring',
  'page',
  'checks',
  'issues'
]

const auditPayloadKeySet = new Set(auditPayloadKeys)
const forbiddenCachePayloadKeys = new Set([
  'requestId',
  'success',
  'cached',
  'X-Cache',
  'body',
  'headers',
  'addresses',
  'approvedAddresses',
  'dispatcher',
  'AbortController',
  'error',
  'logger',
  'request',
  'response',
  'req',
  'res'
])
const grades = new Set(['A', 'B', 'C', 'D', 'F'])

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOnlyApprovedPayloadKeys(value) {
  const keys = Reflect.ownKeys(value)

  if (keys.length !== auditPayloadKeys.length) {
    return false
  }

  for (const key of keys) {
    if (typeof key !== 'string' || !auditPayloadKeySet.has(key) || forbiddenCachePayloadKeys.has(key)) {
      return false
    }
  }

  return auditPayloadKeys.every((key) => Object.hasOwn(value, key))
}

function isFiniteNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function isValidCachedAuditPayload(value) {
  if (!isPlainObject(value) || !hasOnlyApprovedPayloadKeys(value)) {
    return false
  }

  return typeof value.requestedUrl === 'string' &&
    typeof value.finalUrl === 'string' &&
    isFiniteNonNegativeInteger(value.httpStatus) &&
    isFiniteNonNegativeInteger(value.redirectCount) &&
    Number.isFinite(value.responseTimeMs) &&
    value.responseTimeMs >= 0 &&
    typeof value.contentType === 'string' &&
    isFiniteNonNegativeInteger(value.responseSizeBytes) &&
    typeof value.auditedAt === 'string' &&
    value.auditStatus === 'complete' &&
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    value.score <= 100 &&
    grades.has(value.grade) &&
    isPlainObject(value.scoring) &&
    isPlainObject(value.page) &&
    isPlainObject(value.checks) &&
    Array.isArray(value.issues)
}

function buildAuditPayload(transportResult, analysisResult, scoringResult) {
  return {
    requestedUrl: transportResult.requestedUrl,
    finalUrl: transportResult.finalUrl,
    httpStatus: transportResult.statusCode,
    redirectCount: transportResult.redirectCount,
    responseTimeMs: transportResult.responseTimeMs,
    contentType: transportResult.contentType,
    responseSizeBytes: transportResult.responseSizeBytes,
    auditedAt: transportResult.auditedAt,
    auditStatus: 'complete',
    score: scoringResult.score,
    grade: scoringResult.grade,
    scoring: {
      scoringPolicyVersion: scoringResult.scoringPolicyVersion,
      earnedPoints: scoringResult.earnedPoints,
      possiblePoints: scoringResult.possiblePoints,
      excludedPoints: scoringResult.excludedPoints,
      breakdown: scoringResult.breakdown
    },
    page: analysisResult.page,
    checks: analysisResult.checks,
    issues: analysisResult.issues
  }
}

function getCachedPayload(cache, cacheKey) {
  try {
    const cachedPayload = cache?.get(cacheKey)

    if (cachedPayload === undefined || cachedPayload === null) {
      return undefined
    }

    if (!isValidCachedAuditPayload(cachedPayload)) {
      cache?.delete?.(cacheKey)
      return undefined
    }

    return cachedPayload
  } catch {
    return undefined
  }
}

function setCachedPayload(cache, cacheKey, payload) {
  try {
    cache?.set(cacheKey, payload)
  } catch {
    // Cache writes fail open so a completed audit can still return successfully.
  }
}

export async function prepareAuditRequest(body, options = {}) {
  const validatedBody = validateAuditRequestBody(body)
  const normalisedUrl = normalizeAuditUrl(validatedBody.url)
  const cachedPayload = getCachedPayload(options.auditCache, normalisedUrl)

  if (cachedPayload) {
    return {
      payload: cachedPayload,
      cached: true
    }
  }

  const release = options.auditSemaphore
    ? await options.auditSemaphore.acquire({ signal: options.signal })
    : () => {}

  try {
    const cachedPayloadAfterWait = getCachedPayload(options.auditCache, normalisedUrl)

    if (cachedPayloadAfterWait) {
      return {
        payload: cachedPayloadAfterWait,
        cached: true
      }
    }

    const transportResult = await options.auditHttpClient.fetchAuditTarget(normalisedUrl)
    const analysisResult = options.htmlAnalysisService.analyse(transportResult)
    const scoringResult = options.auditScorer.score(analysisResult.checks)
    const payload = buildAuditPayload(transportResult, analysisResult, scoringResult)

    setCachedPayload(options.auditCache, normalisedUrl, payload)

    return {
      payload,
      cached: false
    }
  } finally {
    release()
  }
}
