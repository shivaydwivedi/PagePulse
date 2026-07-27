import { AppError } from '../utils/errors.js'

export function notFoundMiddleware(req, _res, next) {
  next(new AppError({
    code: 'NOT_FOUND',
    message: 'Route not found.',
    statusCode: 404
  }))
}
