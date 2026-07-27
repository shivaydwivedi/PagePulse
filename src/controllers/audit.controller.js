import { prepareAuditRequest } from '../services/audit.service.js'
import { successEnvelope } from '../utils/response-envelope.js'

export async function createAuditController(req, res) {
  const { transportResult, analysisResult, scoringResult } = await prepareAuditRequest(req.body, {
    auditHttpClient: req.app.locals.auditHttpClient,
    htmlAnalysisService: req.app.locals.htmlAnalysisService,
    auditScorer: req.app.locals.auditScorer
  })

  res.status(200).json(successEnvelope({
    requestId: req.id,
    data: {
      requestedUrl: transportResult.requestedUrl,
      finalUrl: transportResult.finalUrl,
      httpStatus: transportResult.statusCode,
      redirectCount: transportResult.redirectCount,
      responseTimeMs: transportResult.responseTimeMs,
      contentType: transportResult.contentType,
      responseSizeBytes: transportResult.responseSizeBytes,
      auditedAt: transportResult.auditedAt,
      auditStatus: 'complete',
      score: scoringResult.score,
      grade: scoringResult.grade,
      scoring: {
        scoringPolicyVersion: scoringResult.scoringPolicyVersion,
        earnedPoints: scoringResult.earnedPoints,
        possiblePoints: scoringResult.possiblePoints,
        excludedPoints: scoringResult.excludedPoints,
        breakdown: scoringResult.breakdown
      },
      page: analysisResult.page,
      checks: analysisResult.checks,
      issues: analysisResult.issues
    }
  }))
}
