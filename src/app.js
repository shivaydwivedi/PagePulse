import express from 'express'
import { parseEnv } from './config/env.js'
import { createLogger, createRequestLogger } from './infrastructure/logging/logger.js'
import { errorMiddleware } from './middleware/error.middleware.js'
import { notFoundMiddleware } from './middleware/not-found.middleware.js'
import { requestIdMiddleware } from './middleware/request-id.middleware.js'
import { auditRouter } from './routes/audit.routes.js'
import { healthRouter } from './routes/health.routes.js'
import { createDestinationSafetyService } from './services/destination-safety.service.js'

export function createApp(options = {}) {
  const config = options.config ?? parseEnv()
  const logger = options.logger ?? createLogger(config)
  const app = express()

  app.locals.destinationSafetyService = options.destinationSafetyService ?? createDestinationSafetyService({
    resolver: options.resolver
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
