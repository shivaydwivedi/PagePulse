import { prepareAuditRequest } from '../services/audit.service.js'
import { successEnvelope } from '../utils/response-envelope.js'

export async function createAuditController(req, res) {
  const { payload, cached } = await prepareAuditRequest(req.body, {
    auditCache: req.app.locals.auditCache,
    auditSemaphore: req.app.locals.auditSemaphore,
    auditHttpClient: req.app.locals.auditHttpClient,
    htmlAnalysisService: req.app.locals.htmlAnalysisService,
    auditScorer: req.app.locals.auditScorer
  })

  res.set('X-Cache', cached ? 'HIT' : 'MISS')
  res.status(200).json(successEnvelope({
    requestId: req.id,
    data: {
      requestedUrl: payload.requestedUrl,
      finalUrl: payload.finalUrl,
      httpStatus: payload.httpStatus,
      redirectCount: payload.redirectCount,
      responseTimeMs: payload.responseTimeMs,
      contentType: payload.contentType,
      responseSizeBytes: payload.responseSizeBytes,
      auditedAt: payload.auditedAt,
      auditStatus: payload.auditStatus,
      cached,
      score: payload.score,
      grade: payload.grade,
      scoring: payload.scoring,
      page: payload.page,
      checks: payload.checks,
      issues: payload.issues
    }
  }))
}
