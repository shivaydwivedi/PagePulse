import { describe, expect, it } from 'vitest'
import {
  findForbiddenTrackedPaths,
  formatHygieneFailure,
  runRepositoryHygieneCheck
} from '../../scripts/check-repository-hygiene.js'

describe('repository hygiene checks', () => {
  it('allows normal tracked project files and .env.example', () => {
    expect(findForbiddenTrackedPaths([
      '.env.example',
      'src/app.js',
      'tests/unit/repository-hygiene.test.js',
      'README.md'
    ])).toEqual([])
  })

  it('rejects common sensitive and generated tracked paths', () => {
    expect(findForbiddenTrackedPaths([
      '.env',
      '.env.local',
      '.env.production',
      '.env.development',
      'node_modules/express/index.js',
      'coverage/lcov.info',
      'npm-debug.log',
      'certs/private.pem',
      'certs/service.key',
      'id_rsa',
      'id_ed25519'
    ])).toEqual([
      '.env',
      '.env.local',
      '.env.production',
      '.env.development',
      'node_modules/express/index.js',
      'coverage/lcov.info',
      'npm-debug.log',
      'certs/private.pem',
      'certs/service.key',
      'id_rsa',
      'id_ed25519'
    ])
  })

  it('handles nested paths and Windows separators', () => {
    expect(findForbiddenTrackedPaths([
      'apps/api/node_modules/package/index.js',
      'reports\\coverage\\summary.json',
      'secrets\\id_rsa',
      '.\\logs\\app.log'
    ])).toEqual([
      'apps/api/node_modules/package/index.js',
      'reports/coverage/summary.json',
      'secrets/id_rsa',
      'logs/app.log'
    ])
  })

  it('rejects uppercase and mixed-case sensitive or generated paths', () => {
    expect(findForbiddenTrackedPaths([
      '.ENV',
      '.Env.Local',
      'NODE_MODULES/package.js',
      'Coverage/index.html',
      'DEBUG.LOG',
      'CERTIFICATE.PEM',
      'PRIVATE.KEY',
      'ID_RSA',
      'ID_ED25519'
    ])).toEqual([
      '.ENV',
      '.Env.Local',
      'NODE_MODULES/package.js',
      'Coverage/index.html',
      'DEBUG.LOG',
      'CERTIFICATE.PEM',
      'PRIVATE.KEY',
      'ID_RSA',
      'ID_ED25519'
    ])
  })

  it('allows near-matches without broad substring matching', () => {
    expect(findForbiddenTrackedPaths([
      '.Env.Example',
      'keyboard.js',
      'monkey.pem.txt',
      'source/key-utils.js',
      'src/environment.js'
    ])).toEqual([])
  })

  it('returns a concise failure result and a zero-result success path', () => {
    const clean = runRepositoryHygieneCheck(['src/app.js'])
    const dirty = runRepositoryHygieneCheck(['src/app.js', '.env'])

    expect(clean).toEqual({
      ok: true,
      forbiddenPaths: [],
      message: 'Repository hygiene check passed.'
    })
    expect(dirty.ok).toBe(false)
    expect(dirty.forbiddenPaths).toEqual(['.env'])
    expect(formatHygieneFailure(dirty.forbiddenPaths)).toContain('Remove these tracked generated or sensitive files')
  })
})
