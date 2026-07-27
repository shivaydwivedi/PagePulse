import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readText(file) {
  return readFileSync(file, 'utf8')
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(fullPath) : fullPath
  })
}

describe('public UI assets', () => {
  it('uses no external assets, frameworks, remote fonts, or unsafe DOM APIs', () => {
    const html = readText('public/index.html')
    const css = readText('public/styles.css')
    const js = readText('public/app.js')
    const combined = `${html}\n${css}\n${js}`

    expect(html).toContain('<script type="module" src="/app.js"></script>')
    expect(html).toContain('<link rel="modulepreload" href="/ui-core.js">')
    expect(html).toContain('<link rel="stylesheet" href="/styles.css">')
    const externalReferences = [...html.matchAll(/\b(?:src|href)="(https?:\/\/[^"]+)"/g)].map((match) => match[1])
    expect(externalReferences).toEqual(['https://digitalheroesco.com'])
    expect(combined).not.toContain('React')
    expect(combined).not.toContain('Vue')
    expect(combined).not.toContain('Tailwind')
    expect(combined).not.toContain('@font-face')
    expect(combined).not.toContain('innerHTML')
    expect(combined).not.toContain('document.write')
    expect(combined).not.toContain('eval(')
    expect(combined).not.toContain('new Function')
    expect(combined).not.toContain('insertAdjacentHTML')
    expect(combined).not.toContain('outerHTML')
  })

  it('contains API client behaviour for same-origin audits and response headers', () => {
    const js = readText('public/app.js')

    expect(js).toContain("fetch('/api/v1/audits'")
    expect(js).toContain("method: 'POST'")
    expect(js).toContain("'Content-Type': 'application/json'")
    expect(js).toContain('JSON.stringify({ url })')
    expect(js).toContain("headers.get('X-Request-ID')")
    expect(js).toContain("headers.get('X-Cache')")
    expect(js).toContain("headers.get('RateLimit-Limit')")
    expect(js).toContain("headers.get('RateLimit-Remaining')")
    expect(js).toContain("headers.get('RateLimit-Reset')")
    expect(js).toContain("headers.get('Retry-After')")
    expect(js).toContain('parseJsonSafely')
    expect(js).toContain('validateSuccessEnvelope')
    expect(js).toContain('NETWORK_FAILURE')
    expect(js).toContain('UNEXPECTED_RESPONSE')
  })

  it('supports loading, focus, retry countdown, capacity, cache, and copy states', () => {
    const js = readText('public/app.js')

    expect(js).toContain("state.status = nextState")
    expect(js).toContain("elements.statusRegion.setAttribute('aria-busy'")
    expect(js).toContain("elements.result.focus()")
    expect(js).toContain("elements.error.focus()")
    expect(js).toContain('startRetryCountdown')
    expect(js).toContain('getRetryAfterSeconds')
    expect(js).toContain('requestSequence')
    expect(js).toContain('clearInterval(timer)')
    expect(js).toContain('AUDIT_CAPACITY_EXCEEDED')
    expect(js).toContain('RATE_LIMITER_UNAVAILABLE')
    expect(js).toContain('RATE_LIMIT_EXCEEDED')
    expect(js).toContain('Cached result')
    expect(js).toContain('navigator.clipboard.writeText')
  })

  it('guards stale audit responses and clears countdown timers', () => {
    const js = readText('public/app.js')

    expect(js).toContain('state.requestSequence = requestSequence')
    expect(js.match(/requestSequence !== state\.requestSequence/g)).toHaveLength(2)
    expect(js).toContain("if (error.name === 'AbortError') return")
    expect(js).toContain('stopRetryTimers()')
    expect(js).toContain('retryTimers.clear()')
  })

  it('has responsive and reduced-motion CSS with both theme palettes', () => {
    const css = readText('public/styles.css')

    expect(css).toContain('[data-theme="dark"]')
    expect(css).toContain('--accent')
    expect(css).toContain('@media (max-width: 720px)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('overflow-wrap: anywhere')
    expect(css).toContain('.issue-code')
    expect(css).toContain('min-width: 0')
    expect(css).toContain('width: min(1120px, calc(100% - 32px))')
    expect(css).toContain('min-height: 44px')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('::selection')
    expect(css).toContain(':-webkit-autofill')
  })

  it('keeps static assets small and text-only except for the SVG mark', () => {
    const files = walk('public')
    const binaryExtensions = files.filter((file) => /\.(png|jpg|jpeg|webp|gif|ico)$/i.test(file))

    expect(binaryExtensions).toEqual([])
    expect(files).toContain(path.join('public', 'assets', 'pagepulse-mark.svg'))
    for (const file of files) {
      expect(statSync(file).size, file).toBeLessThan(50000)
    }
  })

  it('keeps runtime public assets inside Phase 10B soft budgets', () => {
    const totalJavaScript = statSync('public/app.js').size + statSync('public/ui-core.js').size

    expect(statSync('public/index.html').size).toBeLessThan(15 * 1024)
    expect(statSync('public/styles.css').size).toBeLessThan(25 * 1024)
    expect(totalJavaScript).toBeLessThan(40 * 1024)
    expect(statSync('public/assets/pagepulse-mark.svg').size).toBeLessThan(5 * 1024)
  })

  it('keeps the decorative SVG mark free of accessible-name duplication and scripts', () => {
    const svg = readText('public/assets/pagepulse-mark.svg')

    expect(svg).not.toContain('role="img"')
    expect(svg).not.toContain('<title')
    expect(svg).not.toContain('<script')
    expect(svg).not.toContain('href=')
  })

  it('defines light and dark theme-color metadata', () => {
    const html = readText('public/index.html')
    const js = readText('public/app.js')

    expect(html).toContain('media="(prefers-color-scheme: light)"')
    expect(html).toContain('media="(prefers-color-scheme: dark)"')
    expect(js).toContain('meta[name="theme-color"]:not([media])')
  })
})
