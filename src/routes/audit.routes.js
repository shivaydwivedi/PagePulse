import express, { Router } from 'express'
import { createAuditController } from '../controllers/audit.controller.js'
import { createAuditRateLimitMiddleware } from '../middleware/audit-rate-limit.middleware.js'
import { AppError } from '../utils/errors.js'

export const auditRouter = Router()

function requireJsonWhenBodyPresent(req, _res, next) {
  const contentLength = Number(req.headers['content-length'] ?? 0)
  const hasBody = contentLength > 0 || req.headers['transfer-encoding'] !== undefined

  if (hasBody && !req.is('application/json')) {
    next(new AppError({
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Request body must use application/json.',
      statusCode: 415,
      details: []
    }))
    return
  }

  next()
}

function auditRateLimit(req, res, next) {
  createAuditRateLimitMiddleware(req.app.locals.auditRateLimiter)(req, res, next)
}

function parseAuditJson(req, res, next) {
  express.json({ limit: req.app.locals.config.REQUEST_BODY_LIMIT })(req, res, next)
}

auditRouter.post('/api/v1/audits', auditRateLimit, parseAuditJson, requireJsonWhenBodyPresent, createAuditController)
