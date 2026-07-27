import { AppError } from './errors.js'

const nodeConnectionCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
])

const tlsCodes = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
])

export function createUpstreamError({ code, message, statusCode, details = [], cause }) {
  return new AppError({
    code,
    message,
    statusCode,
    details,
    cause
  })
}

export function mapUpstreamError(error, { timedOut = false } = {}) {
  if (error instanceof AppError) {
    return error
  }

  if (timedOut) {
    return createUpstreamError({
      code: 'UPSTREAM_TIMEOUT',
      message: 'The destination did not respond within the allowed time.',
      statusCode: 504,
      cause: error
    })
  }

  if (tlsCodes.has(error?.code) || tlsCodes.has(error?.cause?.code)) {
    return createUpstreamError({
      code: 'UPSTREAM_TLS_ERROR',
      message: 'PagePulse could not establish a secure connection to the destination.',
      statusCode: 502,
      cause: error
    })
  }

  if (nodeConnectionCodes.has(error?.code) || nodeConnectionCodes.has(error?.cause?.code)) {
    return createUpstreamError({
      code: 'UPSTREAM_CONNECTION_FAILED',
      message: 'PagePulse could not connect to the destination.',
      statusCode: 502,
      cause: error
    })
  }

  return createUpstreamError({
    code: 'UPSTREAM_REQUEST_FAILED',
    message: 'PagePulse could not complete the destination request.',
    statusCode: 502,
    cause: error
  })
}
