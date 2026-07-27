import express from 'express'
import { parseEnv } from './config/env.js'
import { createLogger, createRequestLogger } from './infrastructure/logging/logger.js'
import { errorMiddleware } from './middleware/error.middleware.js'
import { notFoundMiddleware } from './middleware/not-found.middleware.js'
import { requestIdMiddleware } from './middleware/request-id.middleware.js'
import { auditRouter } from './routes/audit.routes.js'
import { healthRouter } from './routes/health.routes.js'
import { createAuditHttpClient } from './infrastructure/http/audit-http-client.js'
import { createTtlCache } from './infrastructure/cache/ttl-cache.js'
import { createAuditSemaphore } from './infrastructure/concurrency/audit-semaphore.js'
import { createDestinationSafetyService } from './services/destination-safety.service.js'
import { createHtmlAnalysisService } from './services/html-analysis.service.js'
import { auditScorer } from './scoring/audit-scorer.js'

export function createApp(options = {}) {
  const config = options.config ?? parseEnv()
  const logger = options.logger ?? createLogger(config)
  const app = express()
  const auditCacheEnabled = config.AUDIT_CACHE_ENABLED ?? true
  const auditCacheTtlMs = config.AUDIT_CACHE_TTL_MS ?? 300000
  const auditCacheMaxEntries = config.AUDIT_CACHE_MAX_ENTRIES ?? 500
  const auditMaxConcurrent = config.AUDIT_MAX_CONCURRENT ?? 5
  const auditMaxQueueSize = config.AUDIT_MAX_QUEUE_SIZE ?? 50
  const auditQueueTimeoutMs = config.AUDIT_QUEUE_TIMEOUT_MS ?? 2000

  app.locals.destinationSafetyService = options.destinationSafetyService ?? createDestinationSafetyService({
    resolver: options.resolver
  })
  app.locals.auditHttpClient = options.auditHttpClient ?? createAuditHttpClient({
    config,
    destinationSafetyService: app.locals.destinationSafetyService,
    dispatcherFactory: options.dispatcherFactory,
    requestFn: options.requestFn,
    clock: options.clock
  })
  app.locals.htmlAnalysisService = options.htmlAnalysisService ?? createHtmlAnalysisService()
  app.locals.auditScorer = options.auditScorer ?? auditScorer
  app.locals.auditCache = options.auditCache ?? createTtlCache({
    enabled: auditCacheEnabled,
    ttlMs: auditCacheTtlMs,
    maxEntries: auditCacheMaxEntries,
    clock: options.cacheClock ?? options.clock
  })
  app.locals.auditSemaphore = options.auditSemaphore ?? createAuditSemaphore({
    maxConcurrent: auditMaxConcurrent,
    maxQueueSize: auditMaxQueueSize,
    queueTimeoutMs: auditQueueTimeoutMs,
    setTimer: options.setTimer,
    clearTimer: options.clearTimer
  })

  app.disable('x-powered-by')
  app.use(requestIdMiddleware)
  app.use(createRequestLogger(logger))
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }))
  app.use(healthRouter)
  app.use(auditRouter)
  app.use(notFoundMiddleware)
  app.use(errorMiddleware)

  return app
}
