import { AppError } from './errors.js'

const allowedProtocols = new Set(['http:', 'https:'])

export function normalizeAuditUrl(rawUrl) {
  const trimmedUrl = rawUrl.trim()
  let url

  try {
    url = new URL(trimmedUrl)
  } catch (error) {
    throw new AppError({
      code: 'INVALID_URL',
      message: 'The provided URL is not valid.',
      statusCode: 400,
      details: [{ field: 'url' }],
      cause: error
    })
  }

  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase()

  if (!allowedProtocols.has(url.protocol)) {
    throw new AppError({
      code: 'UNSUPPORTED_PROTOCOL',
      message: 'Only HTTP and HTTPS URLs are supported.',
      statusCode: 400,
      details: [{ field: 'url' }]
    })
  }

  if (url.username || url.password) {
    throw new AppError({
      code: 'URL_CREDENTIALS_BLOCKED',
      message: 'URLs containing embedded credentials are not allowed.',
      statusCode: 400,
      details: [{ field: 'url' }]
    })
  }

  url.hash = ''

  return url.toString()
}
