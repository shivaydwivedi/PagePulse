import { z } from 'zod'

const logLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
const bodyLimitPattern = /^[1-9]\d*(b|kb|mb)$/i
const userAgentPattern = /^[^\r\n]{1,120}$/

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  REQUEST_BODY_LIMIT: z.string().regex(bodyLimitPattern, 'Expected a size such as 16kb').default('16kb'),
  AUDIT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),
  AUDIT_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(5),
  AUDIT_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1024).max(5242880).default(1048576),
  AUDIT_USER_AGENT: z.string()
    .regex(userAgentPattern, 'Expected a safe user agent string')
    .refine((value) => value.trim().length > 0, 'Expected a non-empty user agent string')
    .default('PagePulseBot/1.0')
})

export function parseEnv(source = process.env) {
  return envSchema.parse(source)
}
