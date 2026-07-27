import { Agent } from 'undici'

function selectAddress(addresses, options = {}) {
  const requestedFamily = options.family

  if (requestedFamily === 4 || requestedFamily === 6) {
    return addresses.find((entry) => entry.family === requestedFamily) ?? addresses[0]
  }

  return addresses[0]
}

export function createApprovedAddressLookup(addresses) {
  return function approvedAddressLookup(_hostname, options, callback) {
    const selectedAddress = selectAddress(addresses, options)

    if (options?.all) {
      callback(null, addresses)
      return
    }

    if (!selectedAddress) {
      callback(new Error('No approved address is available for this destination.'))
      return
    }

    callback(null, selectedAddress.address, selectedAddress.family)
  }
}

export function createApprovedAddressDispatcher({ hostname, addresses }) {
  const dispatcher = new Agent({
    connect: {
      servername: hostname,
      lookup: createApprovedAddressLookup(addresses)
    }
  })

  return {
    dispatcher,
    approvedAddresses: addresses,
    hostname,
    async close() {
      await dispatcher.close()
    }
  }
}
