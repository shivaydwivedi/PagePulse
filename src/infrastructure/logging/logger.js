import pino from 'pino'
import pinoHttp from 'pino-http'

export function createLogger(config) {
  return pino({
    level: config.LOG_LEVEL,
    enabled: config.NODE_ENV !== 'test'
  })
}

export function createRequestLogger(logger) {
  return pinoHttp({
    logger,
    genReqId: (req) => req.id,
    customProps: (req) => ({
      requestId: req.id
    }),
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url
        }
      },
      res(res) {
        return {
          statusCode: res.statusCode
        }
      }
    }
  })
}
