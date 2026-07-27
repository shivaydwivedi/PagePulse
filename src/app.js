import express from 'express'
import { parseEnv } from './config/env.js'
import { createLogger, createRequestLogger } from './infrastructure/logging/logger.js'
import { errorMiddleware } from './middleware/error.middleware.js'
import { notFoundMiddleware } from './middleware/not-found.middleware.js'
import { requestIdMiddleware } from './middleware/request-id.middleware.js'
import { auditRouter } from './routes/audit.routes.js'
import { healthRouter } from './routes/health.routes.js'
import { createAuditHttpClient } from './infrastructure/http/audit-http-client.js'
import { createDestinationSafetyService } from './services/destination-safety.service.js'
import { createHtmlAnalysisService } from './services/html-analysis.service.js'
import { auditScorer } from './scoring/audit-scorer.js'

export function createApp(options = {}) {
  const config = options.config ?? parseEnv()
  const logger = options.logger ?? createLogger(config)
  const app = express()

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
