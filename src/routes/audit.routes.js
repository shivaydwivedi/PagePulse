import { Router } from 'express'
import { createAuditController } from '../controllers/audit.controller.js'
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

auditRouter.post('/api/v1/audits', requireJsonWhenBodyPresent, createAuditController)
