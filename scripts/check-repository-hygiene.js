import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const forbiddenExactPaths = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'id_rsa',
  'id_ed25519'
])

const forbiddenDirectoryNames = new Set(['node_modules', 'coverage'])

const forbiddenExtensions = [
  '.log',
  '.pem',
  '.key'
]

export function normalizeTrackedPath(path) {
  return String(path).replaceAll('\\', '/').replace(/^\.\/+/, '')
}

export function findForbiddenTrackedPaths(paths) {
  return paths
    .map(normalizeTrackedPath)
    .filter((path) => path.length > 0)
    .filter((path) => {
      const lowerPath = path.toLowerCase()
      const basename = lowerPath.split('/').at(-1)
      const segments = lowerPath.split('/')

      return forbiddenExactPaths.has(lowerPath) ||
        forbiddenExactPaths.has(basename) ||
        segments.some((segment) => forbiddenDirectoryNames.has(segment)) ||
        forbiddenExtensions.some((extension) => lowerPath.endsWith(extension))
    })
}

export function formatHygieneFailure(paths) {
  const formattedPaths = paths.map((path) => `- ${path}`).join('\n')

  return `Repository hygiene check failed. Remove these tracked generated or sensitive files:\n${formattedPaths}`
}

export function runRepositoryHygieneCheck(paths) {
  const forbiddenPaths = findForbiddenTrackedPaths(paths)

  return {
    ok: forbiddenPaths.length === 0,
    forbiddenPaths,
    message: forbiddenPaths.length > 0 ? formatHygieneFailure(forbiddenPaths) : 'Repository hygiene check passed.'
  }
}

function getTrackedFiles() {
  const output = execFileSync('git', ['ls-files'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  return output.split(/\r?\n/).filter(Boolean)
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isCli) {
  const result = runRepositoryHygieneCheck(getTrackedFiles())

  if (!result.ok) {
    console.error(result.message)
    process.exitCode = 1
  } else {
    console.log(result.message)
  }
}
