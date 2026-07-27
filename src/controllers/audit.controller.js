import { prepareAuditRequest } from '../services/audit.service.js'
import { errorEnvelope } from '../utils/response-envelope.js'

export function createAuditController(req, res) {
  const { normalisedUrl } = prepareAuditRequest(req.body)

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
