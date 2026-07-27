import { normalizeAuditUrl } from '../utils/normalize-url.js'
import { validateAuditRequestBody } from '../validators/audit.validator.js'

export async function prepareAuditRequest(body, options = {}) {
  const validatedBody = validateAuditRequestBody(body)
  const normalisedUrl = normalizeAuditUrl(validatedBody.url)
  await options.destinationSafetyService.validateDestination(normalisedUrl)

  return {
    normalisedUrl
  }
}
