export class AppError extends Error {
  constructor({ code, message, statusCode = 500, details = [], cause }) {
    super(message, { cause })
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.publicMessage = message
  }

  static from(error) {
    if (error instanceof AppError) {
      return error
    }

    if (error?.type === 'entity.parse.failed') {
      return new AppError({
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
        statusCode: 400,
        details: [],
        cause: error
      })
    }

    return new AppError({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      statusCode: 500,
      details: [],
      cause: error
    })
  }
}
