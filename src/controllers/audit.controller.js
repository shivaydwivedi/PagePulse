import { prepareAuditRequest } from '../services/audit.service.js'
import { successEnvelope } from '../utils/response-envelope.js'

export async function createAuditController(req, res) {
  const { transportResult } = await prepareAuditRequest(req.body, {
    auditHttpClient: req.app.locals.auditHttpClient
  })

  res.status(200).json(successEnvelope({
    requestId: req.id,
    data: {
      requestedUrl: transportResult.requestedUrl,
      finalUrl: transportResult.finalUrl,
      httpStatus: transportResult.statusCode,
      redirectCount: transportResult.redirectCount,
      responseTimeMs: transportResult.responseTimeMs,
      contentType: transportResult.contentType,
      responseSizeBytes: transportResult.responseSizeBytes,
      auditedAt: transportResult.auditedAt,
      auditStatus: 'transport_complete'
    }
  }))
}
