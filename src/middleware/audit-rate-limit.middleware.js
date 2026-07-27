import { normalizeClientIp } from '../utils/client-identity.js'
import { AppError } from '../utils/errors.js'

const decisionKeys = ['allowed', 'limit', 'remaining', 'resetAt', 'retryAfterSeconds']
const decisionKeySet = new Set(decisionKeys)

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function isValidDecision(decision) {
  if (!isPlainObject(decision)) {
    return false
  }

  const keys = Reflect.ownKeys(decision)
  if (keys.length !== decisionKeys.length) {
    return false
  }

  for (const key of keys) {
    if (typeof key !== 'string' || !decisionKeySet.has(key)) {
      return false
    }
  }

  if (!decisionKeys.every((key) => Object.hasOwn(decision, key))) {
    return false
  }

  if (typeof decision.allowed !== 'boolean' ||
    !Number.isInteger(decision.limit) ||
    decision.limit < 1 ||
    !isNonNegativeInteger(decision.remaining) ||
    decision.remaining > decision.limit ||
    !isNonNegativeInteger(decision.resetAt) ||
    !isNonNegativeInteger(decision.retryAfterSeconds)) {
    return false
  }

  if (decision.allowed) {
    return decision.retryAfterSeconds === 0
  }

  return decision.remaining === 0 && decision.retryAfterSeconds >= 1
}

function limiterUnavailableError(cause) {
  return new AppError({
    code: 'RATE_LIMITER_UNAVAILABLE',
    message: 'Audit request limiting is temporarily unavailable.',
    statusCode: 503,
    details: [],
    cause
  })
}

function secondsUntilReset(resetAt) {
  return Math.max(0, Math.ceil((resetAt - Date.now()) / 1000))
}

function setRateLimitHeaders(res, decision) {
  res.set('RateLimit-Limit', String(decision.limit))
  res.set('RateLimit-Remaining', String(decision.remaining))
  res.set('RateLimit-Reset', String(secondsUntilReset(decision.resetAt)))
}

export function createAuditRateLimitMiddleware(rateLimiter) {
  return function auditRateLimitMiddleware(req, res, next) {
    let decision

    if (rateLimiter.enabled === false) {
      next()
      return
    }

    try {
      decision = rateLimiter.consume(normalizeClientIp(req.ip))
    } catch (error) {
      next(limiterUnavailableError(error))
      return
    }

    if (!isValidDecision(decision)) {
      next(limiterUnavailableError(new Error('Rate limiter returned an invalid decision.')))
      return
    }

    setRateLimitHeaders(res, decision)

    if (decision.allowed) {
      next()
      return
    }

    res.set('Retry-After', String(decision.retryAfterSeconds))
    next(new AppError({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many audit requests. Please try again later.',
      statusCode: 429,
      details: [{ retryAfterSeconds: decision.retryAfterSeconds }]
    }))
  }
}
