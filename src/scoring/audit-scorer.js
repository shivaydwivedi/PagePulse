import { AppError } from '../utils/errors.js'
import { scoringPolicy } from './scoring-policy.js'

function internalScoringError(message, cause) {
  return new AppError({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred.',
    statusCode: 500,
    cause: cause ?? new Error(message)
  })
}

function normalizePointValue(value) {
  if (Object.is(value, -0)) {
    return 0
  }

  return Number(Number(value).toFixed(1))
}

function assertValidPolicy(policy) {
  if (!policy || typeof policy !== 'object') {
    throw internalScoringError('Scoring policy is missing.')
  }

  if (!Array.isArray(policy.checkOrder) || policy.checkOrder.length !== 10) {
    throw internalScoringError('Scoring policy check order is invalid.')
  }

  const uniqueChecks = new Set(policy.checkOrder)
  if (uniqueChecks.size !== policy.checkOrder.length) {
    throw internalScoringError('Scoring policy check order contains duplicates.')
  }

  const weightTotal = policy.checkOrder.reduce((sum, checkName) => {
    const weight = policy.weights?.[checkName]

    if (!Number.isFinite(weight) || weight < 0) {
      throw internalScoringError('Scoring policy weight is invalid.')
    }

    return sum + weight
  }, 0)

  if (weightTotal !== 100) {
    throw internalScoringError('Scoring policy weights must total 100.')
  }

  for (const status of ['pass', 'warning', 'fail']) {
    const multiplier = policy.statusMultipliers?.[status]

    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1) {
      throw internalScoringError('Scoring policy status multiplier is invalid.')
    }
  }

  if (!Array.isArray(policy.gradeBoundaries) || policy.gradeBoundaries.at(-1)?.minScore !== 0) {
    throw internalScoringError('Scoring policy grade boundaries are invalid.')
  }
}

function validateChecks(checks, policy) {
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
    throw internalScoringError('Audit checks are missing or invalid.')
  }

  const allowedChecks = new Set(policy.checkOrder)

  for (const checkName of Reflect.ownKeys(checks)) {
    if (typeof checkName !== 'string' || !allowedChecks.has(checkName)) {
      throw internalScoringError('Audit checks include an unknown check.')
    }
  }

  for (const checkName of policy.checkOrder) {
    if (!Object.hasOwn(checks, checkName)) {
      throw internalScoringError('Audit checks are missing a required check.')
    }

    const status = checks[checkName]?.status

    if (typeof status !== 'string') {
      throw internalScoringError('Audit check status is missing.')
    }

    if (status !== policy.notApplicableStatus && !Object.hasOwn(policy.statusMultipliers, status)) {
      throw internalScoringError('Audit check status is unknown.')
    }
  }
}

export function gradeScore(score, policy = scoringPolicy) {
  if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0 || score > 100) {
    throw internalScoringError('Score cannot be graded.')
  }

  for (const boundary of policy.gradeBoundaries) {
    if (score >= boundary.minScore) {
      return boundary.grade
    }
  }

  throw internalScoringError('Score cannot be graded.')
}

export function createAuditScorer(options = {}) {
  const policy = options.policy ?? scoringPolicy
  assertValidPolicy(policy)

  function score(checks) {
    validateChecks(checks, policy)

    let earnedPoints = 0
    let possiblePoints = 0
    let excludedPoints = 0
    const breakdown = {}

    for (const checkName of policy.checkOrder) {
      const status = checks[checkName].status
      const weight = policy.weights[checkName]
      const applicable = status !== policy.notApplicableStatus
      const checkEarnedPoints = applicable
        ? normalizePointValue(weight * policy.statusMultipliers[status])
        : 0

      if (applicable) {
        earnedPoints += checkEarnedPoints
        possiblePoints += weight
      } else {
        excludedPoints += weight
      }

      breakdown[checkName] = {
        status,
        weight,
        applicable,
        earnedPoints: checkEarnedPoints
      }
    }

    earnedPoints = normalizePointValue(earnedPoints)
    possiblePoints = normalizePointValue(possiblePoints)
    excludedPoints = normalizePointValue(excludedPoints)

    if (possiblePoints <= 0 || !Number.isFinite(possiblePoints)) {
      throw internalScoringError('Scoring cannot continue with no applicable checks.')
    }

    if (normalizePointValue(possiblePoints + excludedPoints) !== 100) {
      throw internalScoringError('Scoring possible and excluded points are invalid.')
    }

    const scoreValue = Math.min(100, Math.max(0, Math.round((earnedPoints / possiblePoints) * 100)))

    return {
      scoringPolicyVersion: policy.version,
      earnedPoints,
      possiblePoints,
      excludedPoints,
      breakdown,
      score: scoreValue,
      grade: gradeScore(scoreValue, policy)
    }
  }

  return { score }
}

export const auditScorer = createAuditScorer()
