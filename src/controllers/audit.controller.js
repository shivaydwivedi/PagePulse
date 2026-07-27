import { prepareAuditRequest } from '../services/audit.service.js'
import { errorEnvelope } from '../utils/response-envelope.js'

export async function createAuditController(req, res) {
  const { normalisedUrl } = await prepareAuditRequest(req.body, {
    destinationSafetyService: req.app.locals.destinationSafetyService
  })

  res.status(501).json(errorEnvelope({
    requestId: req.id,
    code: 'AUDIT_PROCESSING_NOT_IMPLEMENTED',
    message: 'URL validation succeeded, but audit processing is not implemented yet.',
    details: [
      {
        field: 'url',
        normalisedUrl
      }
    ]
  }))
}
