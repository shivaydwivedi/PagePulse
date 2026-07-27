import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import vitestConfig from '../../vitest.config.js'

function readText(path) {
  return readFileSync(path, 'utf8')
}

function extractWorkflowStep(workflow, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = workflow.match(new RegExp(`      - name: ${escapedName}\\n([\\s\\S]*?)(?=\\n      - name: |\\n?$)`))

  return match?.[1] ?? ''
}

describe('repository quality configuration', () => {
  it('configures the CI workflow with secure deterministic quality gates', () => {
    const workflow = readText('.github/workflows/ci.yml')

    expect(workflow).toContain('name: CI')
    expect(workflow).toContain('pull_request:')
    expect(workflow).toContain('push:')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('branches:')
    expect(workflow).toContain('- main')
    expect(workflow).toContain('group: ci-${{ github.workflow }}-${{ github.ref }}')
    expect(workflow).toContain('cancel-in-progress: true')
    expect(workflow).toContain('permissions:')
    expect(workflow).toContain('contents: read')
    expect(workflow).not.toContain('pull_request_target')
    expect(workflow).not.toContain('contents: write')
    expect(workflow).not.toContain('pull-requests: write')
    expect(workflow).not.toContain('id-token: write')
    expect(workflow).toContain('runs-on: ubuntu-latest')
    expect(workflow).toContain('uses: actions/checkout@v4')
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).toContain('fetch-depth: 0')
    expect(workflow).toContain('uses: actions/setup-node@v4')
    expect(workflow).toContain('node-version: 22')
    expect(workflow).toContain('cache: npm')
    expect(workflow).toContain('cache-dependency-path: package-lock.json')
    expect(workflow).toContain('run: npm ci')
    expect(workflow).not.toContain('npm install')
    expect(workflow).toContain('run: npm run lint')
    expect(workflow).toContain('run: npm run coverage')
    expect(workflow).toContain('run: npm run check:hygiene')
    expect(workflow).toContain('run: npm ls --depth=0')
    expect(workflow).toContain('run: npm audit --audit-level=high')
    expect(workflow).toContain('- name: Check committed whitespace')
    expect(workflow).toContain('- name: Check generated working-tree whitespace')
    expect(workflow).toContain('run: git diff --exit-code -- package.json package-lock.json')
    expect(workflow).toContain('git status --short')
  })

  it('checks committed whitespace for pull request, push, and manual workflow events', () => {
    const workflow = readText('.github/workflows/ci.yml')
    const committedWhitespaceStep = extractWorkflowStep(workflow, 'Check committed whitespace')
    const workingTreeWhitespaceStep = extractWorkflowStep(workflow, 'Check generated working-tree whitespace')

    expect(committedWhitespaceStep).toContain('EVENT_NAME: ${{ github.event_name }}')
    expect(committedWhitespaceStep).toContain('PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}')
    expect(committedWhitespaceStep).toContain('PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}')
    expect(committedWhitespaceStep).toContain('BEFORE_SHA: ${{ github.event.before }}')
    expect(committedWhitespaceStep).toContain('CURRENT_SHA: ${{ github.sha }}')
    expect(committedWhitespaceStep).toContain('set -euo pipefail')
    expect(committedWhitespaceStep).toContain('if [ "$EVENT_NAME" = "pull_request" ]; then')
    expect(committedWhitespaceStep).toContain('git diff --check "$PR_BASE_SHA" "$PR_HEAD_SHA"')
    expect(committedWhitespaceStep).toContain('elif [ "$EVENT_NAME" = "push" ]; then')
    expect(committedWhitespaceStep).toContain('if [ "$BEFORE_SHA" = "$zero_sha" ]; then')
    expect(committedWhitespaceStep).toContain('git diff-tree --check --no-commit-id --root -r "$CURRENT_SHA"')
    expect(committedWhitespaceStep).toContain('git diff --check "$BEFORE_SHA" "$CURRENT_SHA"')
    expect(committedWhitespaceStep).toContain('git rev-parse "$CURRENT_SHA^"')
    expect(committedWhitespaceStep).toContain('git diff --check "$CURRENT_SHA^" "$CURRENT_SHA"')
    expect(workingTreeWhitespaceStep).toContain('run: git diff --check')
    expect(committedWhitespaceStep).not.toBe(workingTreeWhitespaceStep)
  })

  it('fails the final repository status step when visible status output is non-empty', () => {
    const workflow = readText('.github/workflows/ci.yml')
    const statusStep = extractWorkflowStep(workflow, 'Ensure tracked files are unchanged')

    expect(statusStep).toContain('if [ -n "$(git status --short)" ]; then')
    expect(statusStep).toContain('git status --short')
    expect(statusStep).toContain('exit 1')
  })

  it('enforces coverage thresholds and required reporters', () => {
    expect(vitestConfig.test.coverage.include).toEqual(['src/**/*.js'])
    expect(vitestConfig.test.coverage.thresholds).toEqual({
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90
    })
    expect(vitestConfig.test.coverage.reporter).toEqual(['text', 'json-summary', 'lcov'])
    expect(vitestConfig.test.coverage.reportsDirectory).toBe('coverage')

    const gitignore = readText('.gitignore')
    expect(gitignore).toMatch(/^coverage\/$/m)
  })

  it('exposes useful package scripts without destructive audit-fix commands', () => {
    const packageJson = JSON.parse(readText('package.json'))

    expect(packageJson.scripts['check:hygiene']).toBe('node scripts/check-repository-hygiene.js')
    expect(packageJson.scripts.ci).toBe('npm run lint && npm run coverage && npm run check:hygiene')
    expect(packageJson.scripts.check).toBe('npm run lint && npm test')
    expect(Object.values(packageJson.scripts).join('\n')).not.toContain('npm audit fix')
    expect(Object.values(packageJson.scripts).join('\n')).not.toContain('audit fix --force')
  })

  it('includes repository metadata and documents CI expectations', () => {
    expect(readText('CONTRIBUTING.md')).toContain('Node.js 22')
    expect(readText('SECURITY.md')).toContain("GitHub's private vulnerability reporting feature")
    expect(readText('.github/pull_request_template.md')).toContain('No secrets')
    expect(readText('.github/ISSUE_TEMPLATE/bug_report.yml')).toContain('Sensitive data confirmation')
    expect(readText('.github/ISSUE_TEMPLATE/feature_request.yml')).toContain('Security and performance considerations')
    expect(readText('.github/ISSUE_TEMPLATE/config.yml')).toContain('blank_issues_enabled: false')
    expect(readText('.github/dependabot.yml')).toContain('package-ecosystem: npm')
    expect(readText('.github/dependabot.yml')).toContain('package-ecosystem: github-actions')

    const readme = readText('README.md')
    expect(readme).toContain('## Continuous Integration')
    expect(readme).toContain('statements 90%, branches 85%, functions 90%, and lines 90%')
    expect(readme).toContain('require the CI status check before merging')
  })
})
