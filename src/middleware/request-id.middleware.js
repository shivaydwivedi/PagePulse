import { randomUUID } from 'node:crypto'

const requestIdPattern = /^[A-Za-z0-9._:-]{1,80}$/

export function isUsableRequestId(value) {
  return typeof value === 'string' && requestIdPattern.test(value)
}

export function requestIdMiddleware(req, res, next) {
  const incomingRequestId = req.get('X-Request-ID')
  const requestId = isUsableRequestId(incomingRequestId) ? incomingRequestId : randomUUID()

  req.id = requestId
  res.set('X-Request-ID', requestId)
  next()
}
