import { z } from 'zod'
import { AppError } from '../utils/errors.js'

const auditRequestSchema = z.object({
  url: z
    .string({
      required_error: 'URL is required.',
      invalid_type_error: 'URL must be a string.'
    })
    .max(2048, 'URL must be 2048 characters or fewer.')
    .refine((value) => value.trim().length > 0, 'URL must not be empty.')
}).strict()

function toValidationDetails(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.') || 'body',
    message: issue.message
  }))
}

export function validateAuditRequestBody(body) {
  const result = auditRequestSchema.safeParse(body)

  if (!result.success) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      statusCode: 400,
      details: toValidationDetails(result.error)
    })
  }

  return result.data
}
