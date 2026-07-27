import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export const liveRenderUrl = 'https://pagepulse-3gub.onrender.com'

export const requiredArchitectureFiles = [
  'docs/architecture/README.md',
  'docs/architecture/system-overview.md',
  'docs/architecture/request-lifecycle.md',
  'docs/architecture/security-architecture.md',
  'docs/architecture/transport-architecture.md',
  'docs/architecture/analysis-and-scoring.md',
  'docs/architecture/caching-and-concurrency.md',
  'docs/architecture/rate-limiting.md',
  'docs/architecture/observability-and-errors.md',
  'docs/architecture/ci-and-quality-gates.md',
  'docs/architecture/architecture-decisions.md',
  'docs/architecture/future-frontend-architecture.md',
  'docs/architecture/future-deployment-architecture.md'
]

export const requiredDiagramFiles = [
  'docs/diagrams/README.md',
  'docs/diagrams/system-context.mmd',
  'docs/diagrams/audit-request-lifecycle.mmd',
  'docs/diagrams/ssrf-protection-flow.mmd',
  'docs/diagrams/transport-and-redirect-flow.mmd',
  'docs/diagrams/analysis-and-scoring-flow.mmd',
  'docs/diagrams/cache-concurrency-flow.mmd',
  'docs/diagrams/rate-limit-flow.mmd',
  'docs/diagrams/error-handling-flow.mmd',
  'docs/diagrams/ci-quality-flow.mmd',
  'docs/diagrams/deployment-flow.mmd'
]

export const requiredPerformanceFiles = [
  'docs/performance/lighthouse-report.md'
]

export const requiredDeploymentFiles = [
  'docs/deployment/README.md',
  'docs/deployment/render-configuration.md',
  'docs/deployment/production-environment.md',
  'docs/deployment/production-verification-report.md',
  'docs/deployment/operations-and-rollback.md',
  'docs/deployment/post-deployment-verification.md'
]

export const requiredScreenshotFiles = [
  'docs/screenshots/pagepulse-light-desktop.png',
  'docs/screenshots/pagepulse-dark-results.png',
  'docs/screenshots/pagepulse-light-mobile.png',
  'docs/screenshots/pagepulse-dark-error.png'
]

const mermaidKeywords = ['flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'mindmap', 'timeline']
const windowsPathPattern = /[A-Za-z]:\\(?:Users|[^ \n\r\t]*)/
const localFileLinkPattern = /\]\(\/[A-Za-z]:\//
const markdownLinkPattern = /!?\[[^\]]*]\(([^)]+)\)/g
const activeDocs = [
  'README.md',
  ...requiredArchitectureFiles,
  ...requiredDeploymentFiles,
  ...requiredDiagramFiles,
  ...requiredPerformanceFiles
]

function readText(file) {
  return readFileSync(file, 'utf8')
}

function isNonEmpty(file) {
  return readText(file).trim().length > 0
}

function hasUnsafeLocalPath(text) {
  return windowsPathPattern.test(text) || localFileLinkPattern.test(text)
}

function isExternalTarget(target) {
  return /^(https?:|mailto:|#)/i.test(target)
}

function stripLinkSuffix(target) {
  return target.split('#')[0].split('?')[0]
}

function validateReadmeLinks(rootReadme, errors) {
  for (const match of rootReadme.matchAll(markdownLinkPattern)) {
    const rawTarget = match[1].trim()
    if (!rawTarget || isExternalTarget(rawTarget)) {
      continue
    }

    const target = stripLinkSuffix(rawTarget)
    if (!target) {
      continue
    }

    const resolved = path.normalize(target)
    if (!existsSync(resolved)) {
      errors.push(`Root README link does not resolve: ${rawTarget}`)
    }
  }
}

function validateNoPrivateRenderData(text, file, errors) {
  if (/srv-[a-z0-9]{8,}/i.test(text) || /render\.com\/dashboard/i.test(text)) {
    errors.push(`Documentation file may include private Render identifiers: ${file}`)
  }
}

export function validateDocumentationStructure() {
  const errors = []
  const requiredFiles = [
    ...requiredArchitectureFiles,
    ...requiredDiagramFiles,
    ...requiredPerformanceFiles,
    ...requiredDeploymentFiles
  ]

  for (const file of requiredFiles) {
    if (!existsSync(file)) {
      errors.push(`Missing required documentation file: ${file}`)
      continue
    }

    if (!isNonEmpty(file)) {
      errors.push(`Documentation file is empty: ${file}`)
    }

    const text = readText(file)
    if (hasUnsafeLocalPath(text)) {
      errors.push(`Documentation file contains an absolute local path: ${file}`)
    }
    validateNoPrivateRenderData(text, file, errors)
  }

  const rootReadme = existsSync('README.md') ? readText('README.md') : ''
  if (!rootReadme) {
    errors.push('Root README is missing or empty.')
  } else {
    if (hasUnsafeLocalPath(rootReadme)) {
      errors.push('Root README contains an absolute local path.')
    }
    validateNoPrivateRenderData(rootReadme, 'README.md', errors)
    validateReadmeLinks(rootReadme, errors)
  }

  const architectureIndex = existsSync('docs/architecture/README.md') ? readText('docs/architecture/README.md') : ''
  for (const file of requiredArchitectureFiles.filter((file) => file !== 'docs/architecture/README.md')) {
    const link = file.replace('docs/architecture/', '')
    if (!architectureIndex.includes(link)) {
      errors.push(`Architecture index does not link ${file}`)
    }
  }

  const diagramIndex = existsSync('docs/diagrams/README.md') ? readText('docs/diagrams/README.md') : ''
  for (const file of requiredDiagramFiles.filter((file) => file.endsWith('.mmd'))) {
    const link = file.replace('docs/diagrams/', '')
    if (!diagramIndex.includes(link)) {
      errors.push(`Diagram index does not link ${file}`)
    }
  }

  for (const file of requiredArchitectureFiles.filter((file) => file !== 'docs/architecture/README.md')) {
    if (!existsSync(file)) {
      continue
    }

    const text = readText(file)
    if (!text.includes('architecture index](README.md)')) {
      errors.push(`Architecture document does not link back to index: ${file}`)
    }
  }

  for (const file of requiredDiagramFiles.filter((file) => file.endsWith('.mmd'))) {
    if (!existsSync(file)) {
      continue
    }

    const text = readText(file).trim()
    if (text.includes('```')) {
      errors.push(`Mermaid source must not contain Markdown fences: ${file}`)
    }

    if (!mermaidKeywords.some((keyword) => text.startsWith(keyword))) {
      errors.push(`Mermaid source does not start with a known diagram keyword: ${file}`)
    }
  }

  for (const requiredText of [
    liveRenderUrl,
    'Status: Implemented',
    'Provider: Render',
    'Render Free',
    'cold start',
    'TRUST_PROXY',
    'HSTS',
    'Digital Heroes Training Task'
  ]) {
    if (!rootReadme.includes(requiredText)) {
      errors.push(`Root README is missing required text: ${requiredText}`)
    }
  }

  for (const file of requiredScreenshotFiles) {
    if (!existsSync(file)) {
      errors.push(`Missing required screenshot file: ${file}`)
      continue
    }

    if (!rootReadme.includes(file)) {
      errors.push(`Root README does not reference screenshot with a repository-relative path: ${file}`)
    }
  }

  if (!existsSync('public/favicon.svg')) {
    errors.push('Public favicon asset is missing: public/favicon.svg')
  } else if (statSync('public/favicon.svg').size <= 0) {
    errors.push('Public favicon asset is empty: public/favicon.svg')
  }

  if (!rootReadme.includes('not Lighthouse') || !rootReadme.includes('not a browser-rendering engine') || !rootReadme.includes('not a Core Web Vitals measurement service')) {
    errors.push('Root README must clearly distinguish PagePulse from Lighthouse, browser rendering, and Core Web Vitals measurement.')
  }

  const performanceReport = existsSync('docs/performance/lighthouse-report.md') ? readText('docs/performance/lighthouse-report.md') : ''
  for (const requiredText of ['Measurement Conditions', 'Median', 'lab results', 'not field data', 'LCP', 'CLS']) {
    if (!performanceReport.includes(requiredText)) {
      errors.push(`Performance report is missing required text: ${requiredText}`)
    }
  }

  if (performanceReport.includes('production field data') && !performanceReport.includes('not production field data')) {
    errors.push('Performance report must not claim production field data.')
  }

  const deploymentCombined = requiredDeploymentFiles
    .filter((file) => existsSync(file))
    .map((file) => readText(file))
    .join('\n')

  for (const requiredText of [
    liveRenderUrl,
    'Status: Implemented',
    'Provider: Render',
    'Web Service',
    'Repository',
    'shivaydwivedi/PagePulse',
    'Branch',
    'main',
    'Runtime',
    'Node',
    'Build command',
    'npm ci',
    'Start command',
    'npm start',
    'Render-managed',
    'PORT',
    '10000',
    'Free',
    'Auto-deploy',
    'No database',
    'No persistent disk',
    'cold start',
    'production-verification-report.md',
    'TRUST_PROXY',
    'left unset',
    'HSTS',
    'max-age=2592000'
  ]) {
    if (!deploymentCombined.includes(requiredText)) {
      errors.push(`Deployment documentation is missing required text: ${requiredText}`)
    }
  }

  if (!deploymentCombined.includes('https://www.wikipedia.org') || !deploymentCombined.includes('https://www.youtube.com')) {
    errors.push('Production verification report must include Wikipedia and YouTube audit checks.')
  }

  if (existsSync('docs/deployment/northflank-configuration.md')) {
    errors.push('Obsolete Northflank deployment configuration must not remain active.')
  }

  const stalePatterns = [
    /Status:\s*Prepared,\s*not live/i,
    /Live URL:\s*pending/i,
    /pending Render deployment/i,
    /Status:\s*Pending live deployment/i,
    /Requires live verification/i,
    /deployment is prepared but not live/i,
    /service is not live/i
  ]

  for (const file of activeDocs) {
    if (!existsSync(file)) {
      continue
    }
    const text = readText(file)
    if (stalePatterns.some((pattern) => pattern.test(text))) {
      errors.push(`Documentation file contains stale pending-live wording: ${file}`)
    }
  }

  const activeCombined = activeDocs
    .filter((file) => existsSync(file))
    .map((file) => readText(file))
    .join('\n')

  if (/Northflank|northflank/i.test(activeCombined)) {
    errors.push('Active documentation must not keep stale Northflank references.')
  }

  if (/https:\/\/(?!pagepulse-3gub\.onrender\.com)[^ \n)]+onrender\.com/i.test(activeCombined)) {
    errors.push('Documentation contains an unapproved Render URL.')
  }

  if (/(secret|token|password)\s*[:=]\s*\S+/i.test(activeCombined)) {
    errors.push('Documentation must not include provider secrets.')
  }

  if (/card (number|data)|credit card number|payment card number/i.test(activeCombined)) {
    errors.push('Documentation must not include sensitive billing-card values.')
  }

  return errors
}

if (process.argv[1]?.endsWith('check-documentation-links.js')) {
  const errors = validateDocumentationStructure()

  if (errors.length > 0) {
    console.error(`Documentation check failed with ${errors.length} issue(s):`)
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
  } else {
    console.log('Documentation check passed.')
  }
}
