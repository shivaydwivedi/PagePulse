import { describe, expect, it } from 'vitest'
import { classifyIpAddress, isIpAddress } from '../../src/utils/ip-address.js'

function expectBlocked(address) {
  expect(classifyIpAddress(address).safe).toBe(false)
}

function expectAllowed(address) {
  expect(classifyIpAddress(address)).toEqual({
    safe: true,
    reason: 'public_unicast'
  })
}

describe('IP address safety', () => {
  it('blocks unsafe IPv4 ranges', () => {
    for (const address of [
      '0.0.0.0',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '192.0.2.1',
      '198.18.0.1',
      '198.51.100.1',
      '203.0.113.1',
      '224.0.0.1',
      '255.255.255.255'
    ]) {
      expectBlocked(address)
    }
  })

  it('classifies IPv4 CIDR boundaries exactly', () => {
    const cases = [
      ['100.63.255.255', true],
      ['100.64.0.0', false],
      ['100.127.255.255', false],
      ['100.128.0.0', true],
      ['172.15.255.255', true],
      ['172.16.0.0', false],
      ['172.31.255.255', false],
      ['172.32.0.0', true],
      ['192.167.255.255', true],
      ['192.168.0.0', false],
      ['192.168.255.255', false],
      ['192.169.0.0', true],
      ['198.17.255.255', true],
      ['198.18.0.0', false],
      ['198.19.255.255', false],
      ['198.20.0.0', true]
    ]

    for (const [address, safe] of cases) {
      expect(classifyIpAddress(address).safe).toBe(safe)
    }
  })

  it('blocks representative reserved IPv4 ranges', () => {
    for (const address of ['192.0.0.1', '192.88.99.1', '240.0.0.1']) {
      expectBlocked(address)
    }
  })

  it('accepts clearly public IPv4 addresses', () => {
    expectAllowed('93.184.216.34')
  })

  it('rejects malformed or unusual IPv4-like formats safely', () => {
    for (const address of ['999.1.1.1', '127.1', '0127.0.0.1', '0x7f.0.0.1', '2130706433']) {
      expectBlocked(address)
    }
  })

  it('detects literal IP addresses', () => {
    expect(isIpAddress('93.184.216.34')).toBe(true)
    expect(isIpAddress('[2001:4860:4860::8888]')).toBe(true)
    expect(isIpAddress('example.com')).toBe(false)
  })

  it('blocks unsafe IPv6 ranges', () => {
    for (const address of [
      '::',
      '::1',
      '100::1',
      'fc00::1',
      'fd00::1',
      'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
      'fe80::1',
      'ff02::1',
      '2001:db8::1',
      '64:ff9b::808:808'
    ]) {
      expectBlocked(address)
    }
  })

  it('classifies IPv4-mapped IPv6 addresses through IPv4 rules', () => {
    expectBlocked('::ffff:127.0.0.1')
    expectBlocked('::ffff:192.168.1.1')
    expectAllowed('::ffff:8.8.8.8')
    expectAllowed('::ffff:93.184.216.34')
  })

  it('accepts clearly public IPv6 addresses', () => {
    expectAllowed('2001:4860:4860::8888')
  })

  it('rejects malformed IPv6 safely', () => {
    expectBlocked('2001:::1')
  })
})
