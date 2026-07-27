import { z } from 'zod'

const logLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
const bodyLimitPattern = /^[1-9]\d*(b|kb|mb)$/i

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  REQUEST_BODY_LIMIT: z.string().regex(bodyLimitPattern, 'Expected a size such as 16kb').default('16kb')
})

export function parseEnv(source = process.env) {
  return envSchema.parse(source)
}
