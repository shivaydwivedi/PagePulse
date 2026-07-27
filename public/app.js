import {
  checkLabels,
  checkOrder,
  getRetryAfterSeconds,
  normaliseThemeMode,
  validateSuccessEnvelope
} from './ui-core.js'

const themeKey = 'pagepulse.theme'
const lastUrlKey = 'pagepulse.lastUrl'
const retryTimers = new Set()

const elements = {
  form: document.querySelector('#audit-form'),
  urlInput: document.querySelector('#audit-url'),
  urlError: document.querySelector('#url-error'),
  submitButton: document.querySelector('#submit-button'),
  exampleButton: document.querySelector('[data-example-url]'),
  statusRegion: document.querySelector('#status-region'),
  idle: document.querySelector('#idle-state'),
  loading: document.querySelector('#loading-state'),
  result: document.querySelector('#result-state'),
  error: document.querySelector('#error-state'),
  loadingUrl: document.querySelector('[data-loading-url]'),
  score: document.querySelector('[data-score]'),
  grade: document.querySelector('[data-grade]'),
  summaryGrid: document.querySelector('[data-summary-grid]'),
  statusCounts: document.querySelector('[data-status-counts]'),
  checkList: document.querySelector('[data-check-list]'),
  issueList: document.querySelector('[data-issue-list]'),
  technicalMetadata: document.querySelector('[data-technical-metadata]'),
  copyStatus: document.querySelector('[data-copy-status]'),
  errorTitle: document.querySelector('[data-error-title]'),
  errorMessage: document.querySelector('[data-error-message]'),
  errorMetadata: document.querySelector('[data-error-metadata]'),
  retryButton: document.querySelector('[data-retry-button]'),
  retryNote: document.querySelector('[data-retry-note]')
}

const state = {
  status: 'idle',
  submittedUrl: '',
  abortController: null,
  retrySeconds: 0,
  requestSequence: 0
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function resolveTheme(mode) {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode) {
  const selectedMode = normaliseThemeMode(mode)
  document.documentElement.dataset.themeMode = selectedMode
  const resolvedTheme = resolveTheme(selectedMode)
  document.documentElement.dataset.theme = resolvedTheme
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', resolvedTheme === 'dark' ? '#151816' : '#f6f3ee')
  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.checked = input.value === selectedMode
    input.setAttribute('aria-checked', String(input.checked))
  })
}

function initialiseTheme() {
  const stored = safeStorageGet(themeKey)
  applyTheme(normaliseThemeMode(stored))

  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return
      safeStorageSet(themeKey, input.value)
      applyTheme(input.value)
    })
  })

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (document.documentElement.dataset.themeMode === 'system') {
      applyTheme('system')
    }
  })
}

function setState(nextState) {
  state.status = nextState
  for (const panel of [elements.idle, elements.loading, elements.result, elements.error]) {
    panel.hidden = panel.dataset.statePanel !== nextState
  }
  elements.statusRegion.setAttribute('aria-busy', String(nextState === 'loading'))
  elements.submitButton.disabled = nextState === 'loading' || state.retrySeconds > 0
}

function clearNode(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild)
  }
}

function appendText(parent, tag, text, className) {
  const node = document.createElement(tag)
  if (className) node.className = className
  node.textContent = text
  parent.append(node)
  return node
}

function normaliseUrlInput(value) {
  return value.trim()
}

function validateUrl(value) {
  if (!value) return 'Enter a public URL to audit.'
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'Use an http or https URL.'
    }
    if (parsed.username || parsed.password) {
      return 'Do not include credentials in the URL.'
    }
  } catch {
    return 'Enter a complete URL such as https://example.com.'
  }
  return ''
}

function readHeaders(response) {
  return {
    requestId: response.headers.get('X-Request-ID') || '',
    cache: response.headers.get('X-Cache') || '',
    limit: response.headers.get('RateLimit-Limit') || '',
    remaining: response.headers.get('RateLimit-Remaining') || '',
    reset: response.headers.get('RateLimit-Reset') || '',
    retryAfter: response.headers.get('Retry-After') || ''
  }
}

async function parseJsonSafely(response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return null
  }
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function requestAudit(url, signal) {
  const response = await fetch('/api/v1/audits', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url }),
    signal
  })
  const headers = readHeaders(response)
  const body = await parseJsonSafely(response)

  if (!response.ok) {
    throw { kind: 'api', status: response.status, headers, body }
  }

  const validation = validateSuccessEnvelope(body)
  if (!validation.valid) {
    throw { kind: 'shape', status: response.status, headers, body: null }
  }

  return { data: validation.data, requestId: validation.requestId || headers.requestId, headers }
}

function stopRetryTimers() {
  for (const timer of retryTimers) {
    clearInterval(timer)
  }
  retryTimers.clear()
  state.retrySeconds = 0
  elements.retryNote.textContent = ''
}

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not reported' : date.toLocaleString()
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return 'Not reported'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

function getStatusText(status) {
  return {
    pass: 'Pass',
    warning: 'Warning',
    fail: 'Fail',
    not_applicable: 'Not applicable'
  }[status] || 'Unknown'
}

function countStatuses(checks) {
  return checks.reduce((counts, check) => {
    const status = check.status || 'unknown'
    counts[status] = (counts[status] || 0) + 1
    return counts
  }, {})
}

function makeSummaryItem(label, value) {
  const item = document.createElement('div')
  item.className = 'summary-item'
  appendText(item, 'span', label)
  appendText(item, 'strong', value)
  return item
}

function renderSummary(data) {
  clearNode(elements.summaryGrid)
  const issues = Array.isArray(data.issues) ? data.issues : []
  const checks = getChecks(data)
  const counts = countStatuses(checks)
  const items = [
    ['Final URL', data.finalUrl || 'Not reported'],
    ['Audited at', formatDate(data.auditedAt)],
    ['Cache', data.cached ? 'Cached result' : 'Fresh audit'],
    ['HTTP status', String(data.httpStatus ?? 'Not reported')],
    ['Response time', `${data.responseTimeMs ?? 'Not reported'} ms`],
    ['Issues', String(issues.length)],
    ['Passed', String(counts.pass || 0)],
    ['Warnings', String(counts.warning || 0)],
    ['Failed', String(counts.fail || 0)],
    ['Not applicable', String(counts.not_applicable || 0)]
  ]
  for (const [label, value] of items) {
    elements.summaryGrid.append(makeSummaryItem(label, value))
  }
  if (data.cached) {
    const note = makeSummaryItem('Cached result', 'This result was reused from a recent audit. The timestamp shows when the page was originally checked.')
    elements.summaryGrid.append(note)
  }
}

function getChecks(data) {
  const checks = data.checks && typeof data.checks === 'object' ? data.checks : {}
  return checkOrder.map((key) => ({
    key,
    label: checkLabels[key],
    ...(checks[key] && typeof checks[key] === 'object' ? checks[key] : {})
  }))
}

function renderStatusCounts(checks) {
  clearNode(elements.statusCounts)
  const counts = countStatuses(checks)
  for (const status of ['pass', 'warning', 'fail', 'not_applicable']) {
    const pill = document.createElement('div')
    pill.className = 'status-pill'
    appendText(pill, 'span', getStatusText(status))
    appendText(pill, 'strong', String(counts[status] || 0))
    elements.statusCounts.append(pill)
  }
}

function renderDetails(parent, details) {
  if (!details || typeof details !== 'object') return
  const entries = Object.entries(details)
  if (entries.length === 0) return
  const disclosure = document.createElement('details')
  const summary = document.createElement('summary')
  summary.textContent = 'Details'
  disclosure.append(summary)
  const list = document.createElement('ul')
  list.className = 'details-list'
  for (const [key, value] of entries) {
    const item = document.createElement('li')
    item.textContent = `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`
    list.append(item)
  }
  disclosure.append(list)
  parent.append(disclosure)
}

function renderChecks(data) {
  const checks = getChecks(data)
  renderStatusCounts(checks)
  clearNode(elements.checkList)
  for (const check of checks) {
    const row = document.createElement('article')
    row.className = 'check-row'
    const status = document.createElement('div')
    appendText(status, 'strong', check.label)
    appendText(status, 'p', getStatusText(check.status), `status-label status-${check.status || 'fail'}`)
    const body = document.createElement('div')
    appendText(body, 'p', check.summary || 'No summary returned.')
    const points = data.scoring?.breakdown?.[check.key] || {}
    if (Number.isFinite(points.earnedPoints) || Number.isFinite(points.weight)) {
      appendText(body, 'p', `${points.earnedPoints ?? 0} of ${points.weight ?? 0} points`, 'muted')
    }
    renderDetails(body, check.details)
    row.append(status, body)
    elements.checkList.append(row)
  }
}

function renderIssues(data) {
  clearNode(elements.issueList)
  const issues = Array.isArray(data.issues) ? data.issues : []
  if (issues.length === 0) {
    appendText(elements.issueList, 'p', 'No issues were reported by the current PagePulse checks.')
    return
  }
  const list = document.createElement('div')
  list.className = 'issue-list'
  for (const issue of issues) {
    const row = document.createElement('article')
    row.className = 'issue-row'
    const meta = document.createElement('div')
    appendText(meta, 'strong', issue.severity === 'high' ? 'Needs attention' : issue.severity === 'medium' ? 'Worth fixing' : 'Informational')
    appendText(meta, 'p', issue.code || 'ISSUE', 'issue-code')
    appendText(meta, 'p', issue.category || 'general', 'muted')
    const body = document.createElement('div')
    appendText(body, 'p', issue.message || 'Issue reported.')
    appendText(body, 'p', issue.suggestion || 'Review this signal.', 'muted')
    row.append(meta, body)
    list.append(row)
  }
  elements.issueList.append(list)
}

function addMetadata(container, label, value, copyValue) {
  const wrapper = document.createElement('div')
  const term = document.createElement('dt')
  term.textContent = label
  const description = document.createElement('dd')
  description.textContent = value || 'Not reported'
  wrapper.append(term, description)
  if (copyValue) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'copy-button'
    button.textContent = `Copy ${label}`
    button.addEventListener('click', () => copyValueToClipboard(copyValue, label))
    wrapper.append(button)
  }
  container.append(wrapper)
}

async function copyValueToClipboard(value, label) {
  try {
    await navigator.clipboard.writeText(value)
    elements.copyStatus.textContent = `Copied ${label}.`
  } catch {
    elements.copyStatus.textContent = 'Copy unavailable in this browser.'
  }
}

function renderTechnicalMetadata(data, requestId, headers) {
  clearNode(elements.technicalMetadata)
  addMetadata(elements.technicalMetadata, 'Requested URL', data.requestedUrl, data.requestedUrl)
  addMetadata(elements.technicalMetadata, 'Final URL', data.finalUrl, data.finalUrl)
  addMetadata(elements.technicalMetadata, 'HTTP status', String(data.httpStatus ?? 'Not reported'))
  addMetadata(elements.technicalMetadata, 'Redirect count', String(data.redirectCount ?? 'Not reported'))
  addMetadata(elements.technicalMetadata, 'Response size', formatBytes(data.responseSizeBytes))
  addMetadata(elements.technicalMetadata, 'Content type', data.contentType || 'Not reported')
  addMetadata(elements.technicalMetadata, 'Response time', `${data.responseTimeMs ?? 'Not reported'} ms`)
  addMetadata(elements.technicalMetadata, 'Audit timestamp', formatDate(data.auditedAt))
  addMetadata(elements.technicalMetadata, 'Scoring policy', data.scoring?.scoringPolicyVersion || 'Not reported')
  addMetadata(elements.technicalMetadata, 'Request ID', requestId || headers.requestId, requestId || headers.requestId)
  addMetadata(elements.technicalMetadata, 'Cache status', data.cached ? 'Cached result' : headers.cache || 'MISS')
  addMetadata(elements.technicalMetadata, 'Rate limit remaining', headers.remaining || 'Not reported')
}

function renderSuccess(result) {
  elements.score.textContent = String(result.data.score ?? 0)
  elements.grade.textContent = `Grade ${result.data.grade ?? 'N/A'}`
  renderSummary(result.data)
  renderChecks(result.data)
  renderIssues(result.data)
  renderTechnicalMetadata(result.data, result.requestId, result.headers)
  setState('success')
  elements.result.focus()
}

function getErrorHeading(code, kind) {
  if (kind === 'network') return 'PagePulse could not reach the audit service.'
  return {
    VALIDATION_ERROR: 'Check the URL and try again.',
    INVALID_JSON: 'The audit request was not valid JSON.',
    UNSUPPORTED_MEDIA_TYPE: 'The request type is not supported.',
    BLOCKED_TARGET: 'This address cannot be audited safely.',
    DNS_LOOKUP_FAILED: 'The destination could not be resolved.',
    UPSTREAM_TIMEOUT: 'The page took too long to respond.',
    UPSTREAM_CONNECTION_FAILED: 'The page could not be reached.',
    UPSTREAM_TLS_ERROR: 'The page had a TLS connection problem.',
    INVALID_REDIRECT: 'The page returned an unsafe redirect.',
    RESPONSE_TOO_LARGE: 'The page response is too large to audit.',
    UPSTREAM_UNSUPPORTED_CONTENT: 'The page did not return supported HTML.',
    AUDIT_CAPACITY_EXCEEDED: 'PagePulse is busy right now.',
    RATE_LIMIT_EXCEEDED: 'Too many audits from this connection.',
    RATE_LIMITER_UNAVAILABLE: 'Request limiting is temporarily unavailable.',
    INTERNAL_ERROR: 'PagePulse hit an unexpected problem.'
  }[code] || 'PagePulse could not complete the audit.'
}

function getRetryGuidance(code) {
  return {
    RATE_LIMIT_EXCEEDED: 'Wait for the countdown before retrying.',
    AUDIT_CAPACITY_EXCEEDED: 'Please retry manually in a moment.',
    RATE_LIMITER_UNAVAILABLE: 'Please retry later. The submitted website did not cause this error.',
    UPSTREAM_TIMEOUT: 'You can retry, or audit a different public page.',
    UPSTREAM_CONNECTION_FAILED: 'You can retry if the page is normally reachable.'
  }[code] || 'Review the message and try again when appropriate.'
}

function startRetryCountdown(seconds) {
  state.retrySeconds = Math.max(0, Math.ceil(Number(seconds) || 0))
  if (state.retrySeconds <= 0) return
  elements.submitButton.disabled = true
  elements.retryButton.disabled = true
  const update = () => {
    elements.retryNote.textContent = state.retrySeconds > 0 ? `Retry available in ${state.retrySeconds} seconds.` : 'Retry is available now.'
    if (state.retrySeconds <= 0) {
      stopRetryTimers()
      elements.submitButton.disabled = false
      elements.retryButton.disabled = false
    }
    state.retrySeconds -= 1
  }
  update()
  retryTimers.add(setInterval(update, 1000))
}

function renderError(error) {
  const code = error.body?.error?.code || (error.kind === 'shape' ? 'UNEXPECTED_RESPONSE' : 'NETWORK_FAILURE')
  elements.errorTitle.textContent = getErrorHeading(code, error.kind)
  elements.errorMessage.textContent = error.body?.error?.message || getRetryGuidance(code)
  clearNode(elements.errorMetadata)
  addMetadata(elements.errorMetadata, 'Code', code)
  addMetadata(elements.errorMetadata, 'Request ID', error.body?.requestId || error.headers?.requestId || 'Not reported', error.body?.requestId || error.headers?.requestId)
  if (error.status) addMetadata(elements.errorMetadata, 'HTTP status', String(error.status))
  if (error.headers?.remaining) addMetadata(elements.errorMetadata, 'Rate limit remaining', error.headers.remaining)
  setState('error')
  elements.error.focus()
  if (code === 'RATE_LIMIT_EXCEEDED') {
    startRetryCountdown(getRetryAfterSeconds(error.headers, error.body))
  } else {
    elements.retryNote.textContent = getRetryGuidance(code)
  }
}

async function submitAudit() {
  stopRetryTimers()
  const url = normaliseUrlInput(elements.urlInput.value)
  const validationError = validateUrl(url)
  elements.urlError.textContent = validationError
  if (validationError) {
    elements.urlInput.setAttribute('aria-invalid', 'true')
    elements.urlInput.focus()
    return
  }
  elements.urlInput.removeAttribute('aria-invalid')
  state.submittedUrl = url
  safeStorageSet(lastUrlKey, url)
  state.abortController?.abort()
  state.abortController = new AbortController()
  const requestSequence = state.requestSequence + 1
  state.requestSequence = requestSequence
  elements.loadingUrl.textContent = url
  setState('loading')
  elements.loading.focus()
  try {
    const result = await requestAudit(url, state.abortController.signal)
    if (requestSequence !== state.requestSequence) return
    renderSuccess(result)
  } catch (error) {
    if (requestSequence !== state.requestSequence) return
    if (error.name === 'AbortError') return
    renderError(error instanceof TypeError ? { kind: 'network', headers: {}, body: null } : error)
  }
}

function initialiseForm() {
  const lastUrl = safeStorageGet(lastUrlKey)
  if (lastUrl) elements.urlInput.value = lastUrl
  elements.form.addEventListener('submit', (event) => {
    event.preventDefault()
    if (state.status === 'loading' || state.retrySeconds > 0) return
    submitAudit()
  })
  elements.exampleButton.addEventListener('click', () => {
    elements.urlInput.value = elements.exampleButton.dataset.exampleUrl
    elements.urlInput.focus()
  })
  elements.retryButton.addEventListener('click', () => {
    if (state.retrySeconds > 0) return
    if (state.submittedUrl) elements.urlInput.value = state.submittedUrl
    submitAudit()
  })
}

initialiseTheme()
initialiseForm()
setState('idle')
