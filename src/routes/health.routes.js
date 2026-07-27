import { Router } from 'express'
import { successEnvelope } from '../utils/response-envelope.js'

export const healthRouter = Router()

healthRouter.get('/healthz', (req, res) => {
  res.status(200).json(successEnvelope({
    requestId: req.id,
    data: {
      status: 'ok'
    }
  }))
})
