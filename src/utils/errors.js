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

    return new AppError({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      statusCode: 500,
      details: [],
      cause: error
    })
  }
}
