import { AppError } from '../utils/errors.js'
import { errorEnvelope } from '../utils/response-envelope.js'

export function errorMiddleware(error, req, res, _next) {
  const appError = AppError.from(error)

  req.log?.error({
    err: error,
    requestId: req.id,
    code: appError.code,
    statusCode: appError.statusCode
  }, appError.message)

  res
    .status(appError.statusCode)
    .json(errorEnvelope({
      requestId: req.id,
      code: appError.code,
      message: appError.publicMessage,
      details: appError.details
    }))
}
