import { describe, expect, it, vi } from 'vitest'
import { createAuditHttpClient } from '../../src/infrastructure/http/audit-http-client.js'
import { AppError } from '../../src/utils/errors.js'

const baseConfig = {
  AUDIT_TIMEOUT_MS: 8000,
  AUDIT_MAX_REDIRECTS: 5,
  AUDIT_MAX_RESPONSE_BYTES: 32,
  AUDIT_USER_AGENT: 'PagePulseBot/1.0'
}

const fixedClock = {
  current: 1000,
  now() {
    this.current += 12
    return this.current
  },
  date() {
    return new Date('2026-07-27T00:00:00.000Z')
  }
}

function htmlResponse(options = {}) {
  return {
    statusCode: options.statusCode ?? 200,
    headers: options.headers ?? { 'content-type': 'text/html; charset=utf-8' },
    body: options.body ?? [Buffer.from('<html></html>')]
  }
}

function createTrackedBody(chunks = [], options = {}) {
  const body = {
    destroy: options.withDestroy === false ? undefined : vi.fn(),
    cancel: options.withCancel ? vi.fn(async () => {}) : undefined,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        if (typeof chunk === 'function') {
          yield await chunk()
        } else {
          yield chunk
        }
      }
    }
  }

  return body
}

function createAbortAwareBody(signalStore, body) {
  return {
    destroy: vi.fn(),
    [Symbol.asyncIterator]() {
      return {
        next() {
          return new Promise((_resolve, reject) => {
            signalStore.signal.addEventListener('abort', () => {
              reject(new Error('body aborted'))
            }, { once: true })
          })
        }
      }
    },
    ...body
  }
}

function createClient(options = {}) {
  const close = vi.fn(async () => {})
  const validateDestination = options.validateDestination ?? vi.fn(async (url) => {
    const hostname = new URL(url).hostname

    if (hostname === 'localhost' || hostname === '[fd00::1]' || hostname === '10.0.0.1') {
      throw new AppError({
        code: 'BLOCKED_TARGET',
        message: 'The requested URL resolves to a destination that is not allowed.',
        statusCode: 400
      })
    }

    return {
      hostname,
      addresses: [{ address: '93.184.216.34', family: 4 }]
    }
  })
  const dispatcherFactory = vi.fn((destination) => ({
    dispatcher: { destination },
    close
  }))
  const requestFn = options.requestFn ?? vi.fn(async () => htmlResponse())

  return {
    client: createAuditHttpClient({
      config: { ...baseConfig, ...(options.config ?? {}) },
      destinationSafetyService: { validateDestination },
      dispatcherFactory,
      requestFn,
      clock: options.clock ?? fixedClock
    }),
    validateDestination,
    dispatcherFactory,
    requestFn,
    close
  }
}

describe('audit HTTP client', () => {
  it('returns transport metadata for successful HTML responses without exposing the body publicly', async () => {
    const { client, requestFn } = createClient({
      requestFn: vi.fn(async () => htmlResponse({
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': '13',
          'set-cookie': 'session=secret',
          'x-secret-debug': 'raw',
          'content-security-policy': "default-src 'none'",
          'strict-transport-security': 'max-age=31536000'
        }
      }))
    })

    await expect(client.fetchAuditTarget('https://example.com/')).resolves.toMatchObject({
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      statusCode: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-length': '13',
        'content-security-policy': "default-src 'none'",
        'strict-transport-security': 'max-age=31536000'
      },
      contentType: 'text/html; charset=utf-8',
      responseSizeBytes: 13,
      redirectCount: 0,
      auditedAt: '2026-07-27T00:00:00.000Z',
      body: Buffer.from('<html></html>')
    })
    expect(requestFn.mock.calls[0][1].headers).toEqual({
      accept: 'text/html,application/xhtml+xml;q=0.9',
      'user-agent': 'PagePulseBot/1.0',
      'accept-encoding': 'identity'
    })
    expect(requestFn.mock.calls[0][1].headers.cookie).toBeUndefined()
    expect(requestFn.mock.calls[0][1].headers.authorization).toBeUndefined()
    expect(requestFn.mock.calls[0][1].headers['proxy-authorization']).toBeUndefined()
    expect(requestFn.mock.calls[0][1].headers['x-forwarded-for']).toBeUndefined()
    expect(requestFn.mock.calls[0][1].headers.referer).toBeUndefined()
    expect(requestFn.mock.calls[0][1].body).toBeUndefined()
    const result = await client.fetchAuditTarget('https://example.com/')
    expect(result.headers['set-cookie']).toBeUndefined()
    expect(result.headers['x-secret-debug']).toBeUndefined()
  })

  it('accepts XHTML, charset parameters, upstream 404, upstream 500, and empty HTML bodies', async () => {
    for (const response of [
      htmlResponse({ headers: { 'content-type': 'application/xhtml+xml' } }),
      htmlResponse({ headers: { 'content-type': 'application/xhtml+xml; charset=UTF-8' } }),
      htmlResponse({ statusCode: 404, body: [Buffer.from('missing')] }),
      htmlResponse({ statusCode: 500, body: [Buffer.from('error')] }),
      htmlResponse({ body: [] })
    ]) {
      const { client } = createClient({ requestFn: vi.fn(async () => response) })
      await expect(client.fetchAuditTarget('https://example.com/')).resolves.toMatchObject({
        statusCode: response.statusCode,
        redirectCount: 0
      })
    }
  })

  it('rejects unsupported or missing content types', async () => {
    for (const headers of [
      { 'content-type': 'application/json' },
      { 'content-type': 'text/plain' },
      { 'content-type': 'application/pdf' },
      { 'content-type': 'image/png' },
      {},
      { 'content-type': 'not a content type' }
    ]) {
      const { client } = createClient({ requestFn: vi.fn(async () => htmlResponse({ headers })) })
      await expect(client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
        code: 'UPSTREAM_UNSUPPORTED_CONTENT',
        statusCode: 422
      })
    }
  })

  it('enforces response-size limits from content length and streamed bytes', async () => {
    const contentLengthClient = createClient({
      requestFn: vi.fn(async () => htmlResponse({ headers: { 'content-type': 'text/html', 'content-length': '33' } }))
    }).client
    await expect(contentLengthClient.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE'
    })

    const streamClient = createClient({
      requestFn: vi.fn(async () => htmlResponse({
        headers: { 'content-type': 'text/html', 'content-length': '1' },
        body: [Buffer.alloc(16), Buffer.alloc(17)]
      }))
    }).client
    await expect(streamClient.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE'
    })

    const exactLimitClient = createClient({
      requestFn: vi.fn(async () => htmlResponse({ body: [Buffer.alloc(32)] }))
    }).client
    await expect(exactLimitClient.fetchAuditTarget('https://example.com/')).resolves.toMatchObject({
      responseSizeBytes: 32
    })
  })

  it('handles content-length edge cases with a fail-closed parser', async () => {
    for (const { value, shouldPass } of [
      { value: '0', shouldPass: true },
      { value: '-1', shouldPass: false },
      { value: '1.5', shouldPass: false },
      { value: 'abc', shouldPass: false },
      { value: '1, 2', shouldPass: false },
      { value: ' 32 ', shouldPass: false },
      { value: '32', shouldPass: true },
      { value: '33', shouldPass: false }
    ]) {
      const { client } = createClient({
        requestFn: vi.fn(async () => htmlResponse({
          headers: { 'content-type': 'text/html', 'content-length': value },
          body: [Buffer.alloc(32)]
        }))
      })

      const assertion = expect(client.fetchAuditTarget('https://example.com/'))
      if (shouldPass) {
        await assertion.resolves.toMatchObject({ responseSizeBytes: 32 })
      } else {
        await assertion.rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
      }
    }

    const incorrectSmallLength = createClient({
      requestFn: vi.fn(async () => htmlResponse({
        headers: { 'content-type': 'text/html', 'content-length': '1' },
        body: [Buffer.alloc(16), Buffer.alloc(17)]
      }))
    }).client

    await expect(incorrectSmallLength.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'RESPONSE_TOO_LARGE'
    })
  })

  it('follows absolute and relative redirects with revalidation and returns final URL/count', async () => {
    const responses = [
      htmlResponse({ statusCode: 302, headers: { location: 'https://example.com/next' }, body: [Buffer.from('redirect')] }),
      htmlResponse({ statusCode: 301, headers: { location: '/final?q=1#section' }, body: [Buffer.from('redirect')] }),
      htmlResponse({ headers: { 'content-type': 'text/html' }, body: [Buffer.from('done')] })
    ]
    const { client, validateDestination, requestFn } = createClient({
      requestFn: vi.fn(async () => responses.shift())
    })

    await expect(client.fetchAuditTarget('https://example.com/start')).resolves.toMatchObject({
      requestedUrl: 'https://example.com/start',
      finalUrl: 'https://example.com/final?q=1',
      redirectCount: 2,
      responseSizeBytes: 4
    })
    expect(validateDestination).toHaveBeenCalledTimes(3)
    expect(requestFn).toHaveBeenCalledTimes(3)
  })

  it('supports all recognised redirect statuses and rejects invalid redirect cases', async () => {
    for (const statusCode of [301, 302, 303, 307, 308]) {
      const { client } = createClient({
        requestFn: vi.fn()
          .mockResolvedValueOnce(htmlResponse({ statusCode, headers: { location: 'https://example.com/final' } }))
          .mockResolvedValueOnce(htmlResponse())
      })

      await expect(client.fetchAuditTarget('https://example.com/start')).resolves.toMatchObject({
        finalUrl: 'https://example.com/final',
        redirectCount: 1
      })
    }

    for (const response of [
      htmlResponse({ statusCode: 302, headers: {} }),
      htmlResponse({ statusCode: 302, headers: { location: '' } }),
      htmlResponse({ statusCode: 302, headers: { location: '   ' } }),
      htmlResponse({ statusCode: 302, headers: { location: 'http://[::1' } }),
      htmlResponse({ statusCode: 302, headers: { location: 'ftp://example.com' } }),
      htmlResponse({ statusCode: 302, headers: { location: 'file:///etc/passwd' } }),
      htmlResponse({ statusCode: 302, headers: { location: 'data:text/html,hello' } }),
      htmlResponse({ statusCode: 302, headers: { location: 'https://user@example.com' } }),
      htmlResponse({ statusCode: 302, headers: { location: 'https://user:pass@example.com' } })
    ]) {
      const { client } = createClient({ requestFn: vi.fn(async () => response) })
      await expect(client.fetchAuditTarget('https://example.com/start')).rejects.toMatchObject({
        code: 'INVALID_REDIRECT'
      })
    }
  })

  it('validates redirect target forms and creates a fresh dispatcher for each URL step', async () => {
    for (const { start, location, finalUrl } of [
      { start: 'http://example.com/start', location: 'https://example.com/final', finalUrl: 'https://example.com/final' },
      { start: 'https://example.com/start', location: 'http://example.com/final', finalUrl: 'http://example.com/final' },
      { start: 'https://example.com/start', location: '//example.com/protocol-relative', finalUrl: 'https://example.com/protocol-relative' },
      { start: 'https://example.com/start?x=1', location: '#section', finalUrl: 'https://example.com/start?x=1' }
    ]) {
      const { client, validateDestination, dispatcherFactory } = createClient({
        requestFn: vi.fn()
          .mockResolvedValueOnce(htmlResponse({ statusCode: 302, headers: { location } }))
          .mockResolvedValueOnce(htmlResponse())
      })

      await expect(client.fetchAuditTarget(start)).resolves.toMatchObject({
        finalUrl,
        redirectCount: 1
      })
      expect(validateDestination).toHaveBeenNthCalledWith(1, start, expect.objectContaining({ signal: expect.any(AbortSignal) }))
      expect(validateDestination).toHaveBeenNthCalledWith(2, finalUrl, expect.objectContaining({ signal: expect.any(AbortSignal) }))
      expect(dispatcherFactory).toHaveBeenCalledTimes(2)
    }
  })

  it('enforces redirect limit and allows destination safety to block redirect targets', async () => {
    const tooMany = createClient({
      config: { AUDIT_MAX_REDIRECTS: 0 },
      requestFn: vi.fn(async () => htmlResponse({ statusCode: 302, headers: { location: 'https://example.com/final' } }))
    }).client
    await expect(tooMany.fetchAuditTarget('https://example.com/start')).rejects.toMatchObject({
      code: 'TOO_MANY_REDIRECTS'
    })

    const blocked = createClient({
      requestFn: vi.fn(async () => htmlResponse({ statusCode: 302, headers: { location: 'https://localhost/' } }))
    }).client
    await expect(blocked.fetchAuditTarget('https://example.com/start')).rejects.toMatchObject({
      code: 'BLOCKED_TARGET'
    })

    for (const location of ['https://10.0.0.1/', 'https://[fd00::1]/']) {
      const privateLiteral = createClient({
        requestFn: vi.fn(async () => htmlResponse({ statusCode: 302, headers: { location } }))
      }).client
      await expect(privateLiteral.fetchAuditTarget('https://example.com/start')).rejects.toMatchObject({
        code: 'BLOCKED_TARGET'
      })
    }
  })

  it('maps timeouts and upstream failures and closes dispatchers', async () => {
    const timeout = createClient({
      config: { AUDIT_TIMEOUT_MS: 10 },
      requestFn: vi.fn((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')))
      }))
    })
    await expect(timeout.client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT'
    })

    const connection = createClient({
      requestFn: vi.fn(async () => {
        throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })
      })
    })
    await expect(connection.client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'UPSTREAM_CONNECTION_FAILED'
    })

    const tls = createClient({
      requestFn: vi.fn(async () => {
        throw Object.assign(new Error('tls'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' })
      })
    })
    await expect(tls.client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'UPSTREAM_TLS_ERROR'
    })
    expect(tls.close).toHaveBeenCalled()
  })

  it('applies the overall timeout to destination validation, response headers, body reads, and redirect chains', async () => {
    const duringValidation = createClient({
      config: { AUDIT_TIMEOUT_MS: 10 },
      validateDestination: vi.fn(async (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('validation aborted')), { once: true })
      }))
    })
    await expect(duringValidation.client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT'
    })
    expect(duringValidation.requestFn).not.toHaveBeenCalled()

    const beforeHeaders = createClient({
      config: { AUDIT_TIMEOUT_MS: 10 },
      requestFn: vi.fn((_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('headers aborted')), { once: true })
      }))
    })
    await expect(beforeHeaders.client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT'
    })
    expect(beforeHeaders.close).toHaveBeenCalled()

    const signalStore = {}
    const duringBody = createClient({
      config: { AUDIT_TIMEOUT_MS: 10 },
      requestFn: vi.fn(async (_url, options) => {
        signalStore.signal = options.signal
        return htmlResponse({
          body: createAbortAwareBody(signalStore)
        })
      })
    })
    await expect(duringBody.client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT'
    })
    expect((await duringBody.requestFn.mock.results[0].value).body.destroy).toHaveBeenCalled()

    const acrossRedirects = createClient({
      config: { AUDIT_TIMEOUT_MS: 10 },
      requestFn: vi.fn()
        .mockResolvedValueOnce(htmlResponse({ statusCode: 302, headers: { location: 'https://example.com/next' } }))
        .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('redirect aborted')), { once: true })
        }))
    })
    await expect(acrossRedirects.client.fetchAuditTarget('https://example.com/start')).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT'
    })
    expect(acrossRedirects.validateDestination).toHaveBeenCalledTimes(2)
  })

  it('clears the overall timer after success and failure', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

    try {
      await createClient().client.fetchAuditTarget('https://example.com/')
      await expect(createClient({
        requestFn: vi.fn(async () => {
          throw Object.assign(new Error('reset'), { code: 'ECONNRESET' })
        })
      }).client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
        code: 'UPSTREAM_CONNECTION_FAILED'
      })
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2)
    } finally {
      clearTimeoutSpy.mockRestore()
    }
  })

  it('closes dispatchers and cancels bodies on content and redirect failure paths', async () => {
    for (const response of [
      htmlResponse({ headers: { 'content-type': 'application/json' }, body: createTrackedBody([Buffer.from('{}')]) }),
      htmlResponse({ headers: { 'content-type': 'text/html', 'content-length': '33' }, body: createTrackedBody([Buffer.alloc(1)]) }),
      htmlResponse({ headers: { 'content-type': 'text/html' }, body: createTrackedBody([Buffer.alloc(33)]) }),
      htmlResponse({ statusCode: 302, headers: { location: 'https://localhost/' }, body: createTrackedBody([Buffer.from('redirect')]) }),
      htmlResponse({ statusCode: 302, headers: { location: '   ' }, body: createTrackedBody([Buffer.from('redirect')]) }),
      htmlResponse({ statusCode: 302, headers: {}, body: createTrackedBody([Buffer.from('redirect')]) })
    ]) {
      const { client, close } = createClient({ requestFn: vi.fn(async () => response) })
      await expect(client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
        code: expect.any(String)
      })
      expect(response.body.destroy).toHaveBeenCalled()
      expect(close).toHaveBeenCalled()
    }
  })

  it('does not treat unrelated abort errors as PagePulse timeouts', async () => {
    const { client } = createClient({
      requestFn: vi.fn(async () => {
        throw new DOMException('caller aborted', 'AbortError')
      })
    })

    await expect(client.fetchAuditTarget('https://example.com/')).rejects.toMatchObject({
      code: 'UPSTREAM_REQUEST_FAILED',
      statusCode: 502
    })
  })

  it('passes approved dispatcher boundaries without unrestricted DNS fallback', async () => {
    const { client, dispatcherFactory, requestFn, close } = createClient()

    await client.fetchAuditTarget('https://example.com/')

    expect(dispatcherFactory).toHaveBeenCalledWith({
      hostname: 'example.com',
      addresses: [{ address: '93.184.216.34', family: 4 }]
    })
    expect(requestFn.mock.calls[0][1].dispatcher.destination.addresses).toEqual([
      { address: '93.184.216.34', family: 4 }
    ])
    expect(close).toHaveBeenCalled()
  })
})
