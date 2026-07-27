import { existsSync, readFileSync } from 'node:fs'

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

function readText(path) {
  return readFileSync(path, 'utf8')
}

function isNonEmpty(path) {
  return readText(path).trim().length > 0
}

function hasUnsafeLocalPath(text) {
  return windowsPathPattern.test(text) || localFileLinkPattern.test(text)
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

  if (existsSync('README.md') && !readText('README.md').includes('docs/architecture/README.md')) {
    errors.push('Root README does not link the architecture index.')
  }

  const rootReadme = existsSync('README.md') ? readText('README.md') : ''
  if (rootReadme && !rootReadme.includes('docs/deployment/README.md')) {
    errors.push('Root README does not link the deployment readiness documentation.')
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

  const performanceReport = existsSync('docs/performance/lighthouse-report.md') ? readText('docs/performance/lighthouse-report.md') : ''
  for (const requiredText of ['Measurement Conditions', 'Median', 'lab results', 'not field data', 'LCP', 'CLS']) {
    if (!performanceReport.includes(requiredText)) {
      errors.push(`Performance report is missing required text: ${requiredText}`)
    }
  }

  if (performanceReport.includes('production field data') && !performanceReport.includes('not production field data')) {
    errors.push('Performance report must not claim production field data.')
  }

  const deploymentReadme = existsSync('docs/deployment/README.md') ? readText('docs/deployment/README.md') : ''
  const renderConfig = existsSync('docs/deployment/render-configuration.md') ? readText('docs/deployment/render-configuration.md') : ''
  const productionEnv = existsSync('docs/deployment/production-environment.md') ? readText('docs/deployment/production-environment.md') : ''
  const rollback = existsSync('docs/deployment/operations-and-rollback.md') ? readText('docs/deployment/operations-and-rollback.md') : ''
  const verification = existsSync('docs/deployment/post-deployment-verification.md') ? readText('docs/deployment/post-deployment-verification.md') : ''
  const deploymentCombined = [deploymentReadme, renderConfig, productionEnv, rollback, verification].join('\n')

  if (existsSync('docs/deployment/northflank-configuration.md')) {
    errors.push('Obsolete Northflank deployment configuration must not remain active.')
  }

  for (const requiredText of [
    'Status: Prepared',
    'not live',
    'Provider: Render',
    'Live URL: pending',
    'Requires live verification',
    'rollback',
    'post-deployment',
    'Web Service',
    'Build command',
    'npm ci',
    'Start command',
    'npm start',
    'Render supplies `PORT` automatically',
    'cold start',
    'No database',
    'No persistent disk'
  ]) {
    if (!deploymentCombined.includes(requiredText)) {
      errors.push(`Deployment documentation is missing required text: ${requiredText}`)
    }
  }

  if (!deploymentCombined.includes('TRUST_PROXY') || !deploymentCombined.includes('Pending')) {
    errors.push('Deployment documentation must mark TRUST_PROXY as pending live verification.')
  }

  if (!verification.includes('generated onrender.com HTTPS URL')) {
    errors.push('Post-deployment checklist must include generated onrender.com HTTPS URL verification.')
  }

  if (!verification.includes('Rate-limit headers')) {
    errors.push('Post-deployment checklist must include rate-limit header verification.')
  }

  if (!rollback.includes('Git revert rollback') || !rollback.includes('Render rollback')) {
    errors.push('Rollback documentation must include Render and Git revert paths.')
  }

  if (/card (number|data)|credit card number|payment card number/i.test(deploymentCombined)) {
    errors.push('Deployment documentation must not include payment card data.')
  }

  if (/https:\/\/(pagepulse|[^ \n)]+(?:northflank|onrender\.com))[^ \n)]*/i.test(deploymentCombined)) {
    errors.push('Deployment documentation must not present a live deployment URL.')
  }

  if (/(secret|token|password)\s*[:=]\s*\S+/i.test(deploymentCombined)) {
    errors.push('Deployment documentation must not include provider secrets.')
  }

  if (/Northflank|northflank/i.test(deploymentCombined)) {
    errors.push('Deployment documentation must not keep Northflank as the active provider.')
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
