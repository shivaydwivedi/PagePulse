import { normalizeAuditUrl } from '../utils/normalize-url.js'
import { validateAuditRequestBody } from '../validators/audit.validator.js'

export function prepareAuditRequest(body) {
  const validatedBody = validateAuditRequestBody(body)
  const normalisedUrl = normalizeAuditUrl(validatedBody.url)

  return {
    normalisedUrl
  }
}
