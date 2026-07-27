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
  'docs/diagrams/ci-quality-flow.mmd'
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
  const requiredFiles = [...requiredArchitectureFiles, ...requiredDiagramFiles]

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
