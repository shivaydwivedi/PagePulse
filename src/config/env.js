import { z } from 'zod'

const logLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
const bodyLimitPattern = /^[1-9]\d*(b|kb|mb)$/i
const userAgentPattern = /^[^\r\n]{1,120}$/

const booleanSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  if (value === 'true' || value === '1') {
    return true
  }

  if (value === 'false' || value === '0') {
    return false
  }

  return value
}, z.boolean())

const trustProxySchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const trimmedValue = value.trim()

  if (!trimmedValue) {
    return value
  }

  if (trimmedValue === 'true') {
    return true
  }

  if (trimmedValue === 'false') {
    return false
  }

  if (/^(0|[1-9]|10)$/.test(trimmedValue)) {
    return Number(trimmedValue)
  }

  return value
}, z.union([z.boolean(), z.number().int().min(0).max(10)]))

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
    .default('PagePulseBot/1.0'),
  AUDIT_CACHE_ENABLED: booleanSchema.default(true),
  AUDIT_CACHE_TTL_MS: z.coerce.number().int().min(1000).max(3600000).default(300000),
  AUDIT_CACHE_MAX_ENTRIES: z.coerce.number().int().min(1).max(5000).default(500),
  AUDIT_MAX_CONCURRENT: z.coerce.number().int().min(1).max(50).default(5),
  AUDIT_MAX_QUEUE_SIZE: z.coerce.number().int().min(0).max(500).default(50),
  AUDIT_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(2000),
  AUDIT_RATE_LIMIT_ENABLED: booleanSchema.default(true),
  AUDIT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  AUDIT_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(30),
  AUDIT_RATE_LIMIT_MAX_CLIENTS: z.coerce.number().int().min(1).max(100000).default(10000),
  TRUST_PROXY: trustProxySchema.default(false)
})

export function parseEnv(source = process.env) {
  return envSchema.parse(source)
}
