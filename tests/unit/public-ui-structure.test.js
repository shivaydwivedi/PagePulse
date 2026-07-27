import { readFileSync } from 'node:fs'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'

const testConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'info',
  REQUEST_BODY_LIMIT: '16kb',
  AUDIT_RATE_LIMIT_ENABLED: false
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

describe('public UI structure', () => {
  it('serves the public page at root while API routes remain JSON', async () => {
    const app = createApp({ config: testConfig })

    const root = await request(app).get('/').expect(200)
    expect(root.headers['content-type']).toContain('text/html')
    expect(root.text).toContain('<main id="main"')

    const health = await request(app).get('/healthz').expect(200)
    expect(health.headers['content-type']).toContain('application/json')
    expect(health.body.success).toBe(true)

    const apiMissing = await request(app).get('/api/missing').expect(404)
    expect(apiMissing.headers['content-type']).toContain('application/json')
    expect(apiMissing.body.error.code).toBe('NOT_FOUND')

    const missing = await request(app).get('/missing').expect(404)
    expect(missing.headers['content-type']).toContain('application/json')
    expect(missing.body.error.code).toBe('NOT_FOUND')
  })

  it('sets first-party security headers without breaking the public UI or JSON routes', async () => {
    const app = createApp({ config: testConfig })

    const root = await request(app).get('/').expect(200)
    const health = await request(app).get('/healthz').expect(200)
    const script = await request(app).get('/app.js').expect(200)

    for (const response of [root, health, script]) {
      expect(response.headers['content-security-policy']).toContain("default-src 'self'")
      expect(response.headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline'")
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'")
      expect(response.headers['x-content-type-options']).toBe('nosniff')
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(response.headers['permissions-policy']).toContain('geolocation=()')
      expect(response.headers['x-frame-options']).toBe('DENY')
      expect(response.headers['strict-transport-security']).toBeUndefined()
    }
  })

  it('keeps health checks lightweight and outside audit-only local state', async () => {
    const app = createApp({
      config: testConfig,
      auditCache: {
        get() {
          throw new Error('health must not touch cache')
        }
      },
      auditSemaphore: {
        acquire() {
          throw new Error('health must not acquire semaphore')
        }
      },
      auditRateLimiter: {
        consume() {
          throw new Error('health must not consume rate limit')
        }
      },
      auditHttpClient: {
        fetchAuditTarget() {
          throw new Error('health must not fetch')
        }
      },
      destinationSafetyService: {
        validate() {
          throw new Error('health must not resolve')
        }
      }
    })

    const response = await request(app)
      .get('/healthz')
      .expect(200)

    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'ok'
      }
    })
  })

  it('includes accessible initial HTML, metadata, form, noscript copy, and attribution', () => {
    const html = readText('public/index.html')

    expect(html).toContain('<html lang="en"')
    expect(html).toContain('<meta name="viewport"')
    expect(html).toContain('PagePulse - Focused Website Audit')
    expect(html).toContain('Run a focused audit of a public web page')
    expect(html).toContain('href="#main"')
    expect(html).toContain('See what your page gets right—and what needs attention.')
    expect(html).toContain('<form id="audit-form"')
    expect(html).toContain('<label for="audit-url">Page URL</label>')
    expect(html).toContain('type="url"')
    expect(html).toContain('Run audit')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-busy="false"')
    expect(html).toContain('PagePulse needs JavaScript to submit and display audits.')
    expect(html).toContain('Built for <a href="https://digitalheroesco.com"')
    expect(html).toContain('Digital Heroes Training Task')
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
  })

  it('serves the shared UI validation module as a static asset', async () => {
    const app = createApp({ config: testConfig })

    const response = await request(app).get('/ui-core.js').expect(200)

    expect(response.headers['content-type']).toContain('text/javascript')
    expect(response.text).toContain('validateSuccessEnvelope')
  })

  it('defines all required UI states and stable check labels', () => {
    const html = readText('public/index.html')
    const core = readText('public/ui-core.js')

    for (const state of ['idle', 'loading', 'success', 'error']) {
      expect(html).toContain(`data-state-panel="${state}"`)
    }

    for (const label of [
      'HTTPS',
      'Title',
      'Meta description',
      'Canonical URL',
      'Viewport',
      'HTML language',
      'Headings',
      'Images',
      'Links',
      'Security headers'
    ]) {
      expect(core).toContain(label)
    }
  })

  it('documents and exposes theme modes with safe storage keys', () => {
    const html = readText('public/index.html')
    const js = readText('public/app.js')
    const core = readText('public/ui-core.js')

    expect(html).toContain('value="light"')
    expect(html).toContain('value="dark"')
    expect(html).toContain('value="system" checked')
    expect(js).toContain("const themeKey = 'pagepulse.theme'")
    expect(js).toContain("const lastUrlKey = 'pagepulse.lastUrl'")
    expect(core).toContain("validThemes.has(mode) ? mode : 'system'")
    expect(js).toContain("matchMedia('(prefers-color-scheme: dark)')")
    expect(js).toContain("addEventListener('change'")
  })
})
