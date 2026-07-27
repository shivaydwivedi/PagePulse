import { normalizeAuditUrl } from '../utils/normalize-url.js'
import { validateAuditRequestBody } from '../validators/audit.validator.js'

export async function prepareAuditRequest(body, options = {}) {
  const validatedBody = validateAuditRequestBody(body)
  const normalisedUrl = normalizeAuditUrl(validatedBody.url)
  const transportResult = await options.auditHttpClient.fetchAuditTarget(normalisedUrl)

  return {
    transportResult
  }
}
