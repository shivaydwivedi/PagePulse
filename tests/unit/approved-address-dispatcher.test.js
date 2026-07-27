import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { request as undiciRequest } from 'undici'
import {
  createApprovedAddressDispatcher,
  createApprovedAddressLookup
} from '../../src/infrastructure/http/approved-address-dispatcher.js'

function callLookup(lookup, options = {}) {
  return new Promise((resolve, reject) => {
    lookup('ignored.example', options, (error, address, family) => {
      if (error) {
        reject(error)
        return
      }

      resolve({ address, family })
    })
  })
}

describe('approved address dispatcher', () => {
  it('supplies only approved IPv4 and IPv6 addresses through the lookup boundary', async () => {
    const addresses = [
      { address: '93.184.216.34', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 }
    ]
    const lookup = createApprovedAddressLookup(addresses)

    await expect(callLookup(lookup, { family: 4 })).resolves.toEqual({
      address: '93.184.216.34',
      family: 4
    })
    await expect(callLookup(lookup, { family: 6 })).resolves.toEqual({
      address: '2001:4860:4860::8888',
      family: 6
    })
  })

  it('returns approved all-address results and never performs unrestricted DNS', async () => {
    const addresses = [{ address: '93.184.216.34', family: 4 }]
    const lookup = createApprovedAddressLookup(addresses)

    await expect(callLookup(lookup, { all: true })).resolves.toEqual({
      address: addresses,
      family: undefined
    })
  })

  it('preserves original hostname metadata and closes the Undici dispatcher', async () => {
    const boundary = createApprovedAddressDispatcher({
      hostname: 'example.com',
      addresses: [{ address: '93.184.216.34', family: 4 }]
    })

    expect(boundary.hostname).toBe('example.com')
    expect(boundary.approvedAddresses).toEqual([{ address: '93.184.216.34', family: 4 }])
    await expect(boundary.close()).resolves.toBeUndefined()
  })

  it('supports real Undici requests through the approved lookup without system DNS', async () => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'text/html')
      res.end(req.headers.host)
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    const boundary = createApprovedAddressDispatcher({
      hostname: 'pagepulse-approved.test',
      addresses: [{ address: '127.0.0.1', family: 4 }]
    })

    try {
      const response = await undiciRequest(`http://pagepulse-approved.test:${port}/`, {
        dispatcher: boundary.dispatcher
      })
      const body = await response.body.text()

      expect(response.statusCode).toBe(200)
      expect(body).toBe(`pagepulse-approved.test:${port}`)
    } finally {
      await boundary.close()
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('does not fall back to system DNS when no approved address is usable', async () => {
    const boundary = createApprovedAddressDispatcher({
      hostname: 'pagepulse-no-fallback.test',
      addresses: []
    })

    try {
      await expect(undiciRequest('http://pagepulse-no-fallback.test/', {
        dispatcher: boundary.dispatcher
      })).rejects.toThrow()
    } finally {
      await boundary.close()
    }
  })
})
