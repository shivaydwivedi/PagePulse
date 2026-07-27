import { createServer } from 'node:http'
import { createApp } from './app.js'
import { parseEnv } from './config/env.js'
import { createLogger } from './infrastructure/logging/logger.js'

const env = parseEnv()
const logger = createLogger(env)
const app = createApp({ config: env, logger })
const server = createServer(app)
const shutdownTimeoutMs = 10_000

let isShuttingDown = false
let hasStarted = false
let shutdownTimer

server.listen(env.PORT, () => {
  hasStarted = true
  logger.info({ port: env.PORT }, 'PagePulse server started')
})

server.on('error', (error) => {
  logger.error({ err: error }, 'PagePulse server startup failed')
  process.exit(1)
})

function shutdown(signal) {
  if (isShuttingDown) {
    return
  }

  isShuttingDown = true
  logger.info({ signal }, 'PagePulse server shutting down')

  shutdownTimer = setTimeout(() => {
    logger.error({ timeoutMs: shutdownTimeoutMs }, 'PagePulse server shutdown timed out')
    process.exit(1)
  }, shutdownTimeoutMs)

  if (!hasStarted) {
    clearTimeout(shutdownTimer)
    logger.info('PagePulse server stopped')
    process.exit(0)
    return
  }

  server.close((error) => {
    clearTimeout(shutdownTimer)

    if (error) {
      logger.error({ err: error }, 'PagePulse server shutdown failed')
      process.exit(1)
      return
    }

    logger.info('PagePulse server stopped')
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
