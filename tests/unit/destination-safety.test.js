import { describe, expect, it, vi } from 'vitest'
import { createDestinationSafetyService } from '../../src/services/destination-safety.service.js'
import { AppError } from '../../src/utils/errors.js'

function createService(resultsOrResolver) {
  const resolver = typeof resultsOrResolver === 'function'
    ? resultsOrResolver
    : async () => resultsOrResolver

  return createDestinationSafetyService({ resolver })
}

async function expectBlocked(service, url) {
  await expect(service.validateDestination(url)).rejects.toMatchObject({
    code: 'BLOCKED_TARGET',
    statusCode: 400
  })
}

describe('destination safety service', () => {
  it('accepts public-only IPv4 DNS results', async () => {
    const result = await createService([{ address: '93.184.216.34', family: 4 }])
      .validateDestination('https://example.com/')

    expect(result.hostname).toBe('example.com')
  })

  it('accepts public-only IPv6 DNS results', async () => {
    await expect(createService([{ address: '2001:4860:4860::8888', family: 6 }])
      .validateDestination('https://example.com/')).resolves.toMatchObject({
      hostname: 'example.com'
    })
  })

  it('accepts mixed public IPv4 and public IPv6 DNS results', async () => {
    await expect(createService([
      { address: '93.184.216.34', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 }
    ]).validateDestination('https://example.com/')).resolves.toMatchObject({
      hostname: 'example.com'
    })
  })

  it('rejects mixed public and private DNS results', async () => {
    await expectBlocked(createService([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 }
    ]), 'https://example.com/')

    await expectBlocked(createService([
      { address: '93.184.216.34', family: 4 },
      { address: 'fd00::1', family: 6 }
    ]), 'https://example.com/')
  })

  it('maps empty DNS results and resolver failures to DNS_LOOKUP_FAILED', async () => {
    await expect(createService([]).validateDestination('https://empty.example/')).rejects.toMatchObject({
      code: 'DNS_LOOKUP_FAILED',
      statusCode: 502
    })

    await expect(createService(async () => {
      throw new Error('resolver broke')
    }).validateDestination('https://missing.example/')).rejects.toMatchObject({
      code: 'DNS_LOOKUP_FAILED',
      statusCode: 502
    })
  })

  it('preserves explicit DNS lookup application errors', async () => {
    const service = createService(async () => {
      throw new AppError({
        code: 'DNS_LOOKUP_FAILED',
        message: 'The destination hostname could not be resolved.',
        statusCode: 502
      })
    })

    await expect(service.validateDestination('https://missing.example/')).rejects.toMatchObject({
      code: 'DNS_LOOKUP_FAILED'
    })
  })

  it('rejects unsupported address families and malformed resolver addresses', async () => {
    await expectBlocked(createService([{ address: '93.184.216.34', family: 0 }]), 'https://example.com/')
    await expectBlocked(createService([{ address: '93.184.216.34', family: 5 }]), 'https://example.com/')
    await expectBlocked(createService([{ address: 'not-an-ip', family: 4 }]), 'https://example.com/')
  })

  it('rejects resolver family and address mismatches', async () => {
    await expectBlocked(createService([{ address: '93.184.216.34', family: 6 }]), 'https://example.com/')
    await expectBlocked(createService([{ address: '2001:4860:4860::8888', family: 4 }]), 'https://example.com/')
  })

  it('bypasses DNS for literal public IP addresses', async () => {
    const resolver = vi.fn(async () => [{ address: '10.0.0.1', family: 4 }])
    await expect(createDestinationSafetyService({ resolver })
      .validateDestination('https://93.184.216.34/')).resolves.toMatchObject({
      hostname: '93.184.216.34'
    })
    expect(resolver).not.toHaveBeenCalled()
  })

  it('bypasses DNS and rejects literal blocked IP addresses', async () => {
    const resolver = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    await expectBlocked(createDestinationSafetyService({ resolver }), 'http://127.0.0.1/')
    expect(resolver).not.toHaveBeenCalled()
  })

  it('checks blocked hostnames before DNS', async () => {
    const resolver = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    await expectBlocked(createDestinationSafetyService({ resolver }), 'https://localhost/')
    expect(resolver).not.toHaveBeenCalled()
  })

  it('handles punycoded hostnames through the resolver boundary', async () => {
    const resolver = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
    await expect(createDestinationSafetyService({ resolver })
      .validateDestination('https://xn--bcher-kva.example/')).resolves.toMatchObject({
      hostname: 'xn--bcher-kva.example'
    })
    expect(resolver).toHaveBeenCalledWith('xn--bcher-kva.example')
  })
})
