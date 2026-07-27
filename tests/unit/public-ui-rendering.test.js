import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkOrder } from '../../public/ui-core.js'

class FakeElement {
  constructor(selector = '') {
    this.selector = selector
    this.children = []
    this.dataset = {}
    this.attributes = {}
    this.eventListeners = {}
    this.hidden = false
    this.disabled = false
    this.checked = false
    this.value = ''
    this.textContent = ''
    this.className = ''
    this.type = ''
  }

  append(...nodes) {
    this.children.push(...nodes)
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value)
  }

  removeAttribute(name) {
    delete this.attributes[name]
  }

  addEventListener(name, handler) {
    this.eventListeners[name] = handler
  }

  focus() {
    this.focused = true
  }
}

function validCheck(status = 'pass') {
  return {
    status,
    summary: 'The check returned a safe summary.',
    details: {
      present: true
    }
  }
}

function validBreakdownEntry(status = 'pass') {
  return {
    status,
    applicable: true,
    earnedPoints: status === 'warning' ? 5 : 10,
    weight: 10
  }
}

function productionEnvelope() {
  return {
    success: true,
    requestId: 'render-request-id',
    data: {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      httpStatus: 200,
      redirectCount: 0,
      responseTimeMs: 137,
      contentType: 'text/html',
      responseSizeBytes: 1256,
      auditedAt: '2026-07-27T00:00:00.000Z',
      auditStatus: 'complete',
      cached: true,
      score: 82,
      grade: 'B',
      scoring: {
        scoringPolicyVersion: '1.0',
        earnedPoints: 82,
        possiblePoints: 100,
        excludedPoints: 0,
        breakdown: Object.fromEntries(checkOrder.map((key) => [key, validBreakdownEntry(key === 'securityHeaders' ? 'warning' : 'pass')]))
      },
      page: {
        title: 'Example Domain',
        metaDescription: null,
        canonicalUrl: null,
        language: 'en',
        headingCount: 1,
        imageCount: 0,
        linkCount: 1
      },
      checks: {
        ...Object.fromEntries(checkOrder.map((key) => [key, validCheck()])),
        securityHeaders: {
          status: 'warning',
          summary: '2 of 6 recommended security headers are present or applicable.',
          details: {
            contentSecurityPolicy: { status: 'warning', present: false },
            strictTransportSecurity: { status: 'warning', present: false, applicable: true },
            xContentTypeOptions: { status: 'pass', present: true, expected: 'nosniff' },
            xFrameOptions: { status: 'warning', present: false, expected: 'DENY or SAMEORIGIN' },
            referrerPolicy: { status: 'pass', present: true },
            permissionsPolicy: { status: 'warning', present: false }
          }
        }
      },
      issues: []
    }
  }
}

function createFakePage() {
  const selectors = new Map()
  const themeInputs = ['light', 'dark', 'system'].map((value) => {
    const input = new FakeElement(`theme-${value}`)
    input.value = value
    input.checked = value === 'system'
    return input
  })
  const statePanels = ['idle', 'loading', 'success', 'error'].map((state) => {
    const panel = new FakeElement(state)
    panel.dataset.statePanel = state
    return panel
  })

  for (const selector of [
    '#audit-form',
    '#audit-url',
    '#url-error',
    '#submit-button',
    '[data-example-url]',
    '#status-region',
    '[data-loading-url]',
    '[data-score]',
    '[data-grade]',
    '[data-summary-grid]',
    '[data-status-counts]',
    '[data-check-list]',
    '[data-issue-list]',
    '[data-technical-metadata]',
    '[data-copy-status]',
    '[data-error-title]',
    '[data-error-message]',
    '[data-error-metadata]',
    '[data-retry-button]',
    '[data-retry-note]'
  ]) {
    selectors.set(selector, new FakeElement(selector))
  }

  selectors.set('#idle-state', statePanels[0])
  selectors.set('#loading-state', statePanels[1])
  selectors.set('#result-state', statePanels[2])
  selectors.set('#error-state', statePanels[3])
  selectors.get('[data-example-url]').dataset.exampleUrl = 'https://example.com'
  selectors.get('#audit-url').value = 'https://example.com'

  const documentElement = new FakeElement('html')
  const themeMeta = new FakeElement('theme-meta')

  const document = {
    documentElement,
    querySelector(selector) {
      if (selector === 'meta[name="theme-color"]:not([media])') return themeMeta
      return selectors.get(selector) ?? null
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="theme"]') return themeInputs
      return []
    },
    createElement(tag) {
      return new FakeElement(tag)
    }
  }

  return { document, selectors, themeInputs }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('public UI nullable audit-field rendering', () => {
  it('renders a production-shaped success response with nullable page metadata', async () => {
    const page = createFakePage()
    vi.stubGlobal('document', page.document)
    vi.stubGlobal('window', {
      matchMedia: () => ({
        matches: false,
        addEventListener: vi.fn()
      })
    })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn()
    })
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn()
      }
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(productionEnvelope()), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'X-Request-ID': 'render-request-id',
        'X-Cache': 'HIT',
        'RateLimit-Remaining': '29'
      }
    })))

    await import(`${pathToFileURL(`${process.cwd()}/public/app.js`).href}?nullable=${Date.now()}`)
    page.selectors.get('#audit-form').eventListeners.submit({
      preventDefault() {}
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const metadataText = JSON.stringify(page.selectors.get('[data-technical-metadata]').children)
    expect(page.selectors.get('[data-score]').textContent).toBe('82')
    expect(page.selectors.get('[data-grade]').textContent).toBe('Grade B')
    expect(metadataText).toContain('Meta description')
    expect(metadataText).toContain('Canonical URL')
    expect(metadataText).toContain('Not provided')
    expect(metadataText).toContain('Request ID')
    expect(metadataText).toContain('render-request-id')
    expect(metadataText).toContain('Rate limit remaining')
    expect(metadataText).toContain('29')
    expect(page.selectors.get('#result-state').focused).toBe(true)
  })
})
