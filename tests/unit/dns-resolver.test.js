import { describe, expect, it, vi } from 'vitest'
import { createDnsResolver } from '../../src/infrastructure/dns/resolver.js'

describe('DNS resolver wrapper', () => {
  it('returns all lookup addresses and preserves family values', async () => {
    const lookup = vi.fn(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 }
    ])
    const resolveHostname = createDnsResolver(lookup)

    await expect(resolveHostname('example.com')).resolves.toEqual([
      { address: '93.184.216.34', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 }
    ])
    expect(lookup).toHaveBeenCalledWith('example.com', {
      all: true,
      verbatim: true
    })
  })

  it('maps lookup exceptions to DNS_LOOKUP_FAILED and retains the internal cause', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), {
      code: 'ENOTFOUND'
    })
    const resolveHostname = createDnsResolver(async () => {
      throw cause
    })

    await expect(resolveHostname('example.com')).rejects.toMatchObject({
      code: 'DNS_LOOKUP_FAILED',
      statusCode: 502,
      publicMessage: 'The destination hostname could not be resolved.',
      details: [{ field: 'url', hostname: 'example.com' }],
      cause
    })
  })

  it('does not expose raw DNS codes in public details', async () => {
    const resolveHostname = createDnsResolver(async () => {
      throw Object.assign(new Error('resolver failed'), { code: 'EAI_AGAIN' })
    })

    try {
      await resolveHostname('example.com')
      throw new Error('Expected resolver to fail')
    } catch (error) {
      expect(error.details).toEqual([{ field: 'url', hostname: 'example.com' }])
      expect(JSON.stringify(error.details)).not.toContain('EAI_AGAIN')
    }
  })
})
