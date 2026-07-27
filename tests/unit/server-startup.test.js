import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readServer() {
  return readFileSync('src/server.js', 'utf8')
}

describe('server entrypoint deployment compatibility', () => {
  it('starts the production server from parsed environment port without watch mode', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
    const server = readServer()

    expect(packageJson.scripts.start).toBe('node src/server.js')
    expect(packageJson.scripts.start).not.toContain('--watch')
    expect(packageJson.scripts.start).not.toContain('--env-file')
    expect(server).toContain('const env = parseEnv()')
    expect(server).toContain('server.listen(env.PORT')
    expect(server).toContain('PagePulse server started')
    expect(server).not.toMatch(/server\.listen\(env\.PORT,\s*['"`]localhost/)
    expect(packageJson.engines.node).toBe('>=22 <25')
  })

  it('handles graceful SIGTERM and SIGINT shutdown with a forced timeout', () => {
    const server = readServer()

    expect(server).toContain("process.on('SIGINT', shutdown)")
    expect(server).toContain("process.on('SIGTERM', shutdown)")
    expect(server).toContain('server.close((error) => {')
    expect(server).toContain('shutdownTimeoutMs = 10_000')
    expect(server).toContain('PagePulse server shutdown timed out')
    expect(server).toContain('if (isShuttingDown) {')
  })

  it('exits non-zero on startup and shutdown failures', () => {
    const server = readServer()

    expect(server).toContain("server.on('error'")
    expect(server).toContain('PagePulse server startup failed')
    expect(server).toMatch(/process\.exit\(1\)/)
  })
})
