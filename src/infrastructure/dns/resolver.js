import dns from 'node:dns/promises'
import { AppError } from '../../utils/errors.js'

export function createDnsResolver(lookup = dns.lookup) {
  return async function resolveHostname(hostname) {
    try {
      const addresses = await lookup(hostname, {
        all: true,
        verbatim: true
      })

      return addresses.map((result) => ({
        address: result.address,
        family: result.family
      }))
    } catch (error) {
      throw new AppError({
        code: 'DNS_LOOKUP_FAILED',
        message: 'The destination hostname could not be resolved.',
        statusCode: 502,
        details: [{ field: 'url', hostname }],
        cause: error
      })
    }
  }
}

export const resolveHostname = createDnsResolver()
