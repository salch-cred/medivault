/**
 * Tests for the SSRF protection in the node proxy route.
 *
 * We import the exported `isPrivateIp` function directly and test all relevant
 * IP ranges to ensure no private address can be reached through the proxy.
 */
import { describe, it, expect } from 'vitest'
import { isPrivateIp } from './node/route'

describe('isPrivateIp (SSRF protection)', () => {
  describe('IPv4 private ranges that MUST be blocked', () => {
    it('blocks loopback (127.0.0.0/8)', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true)
      expect(isPrivateIp('127.255.255.255')).toBe(true)
    })

    it('blocks 10.0.0.0/8 (RFC-1918)', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true)
      expect(isPrivateIp('10.255.255.255')).toBe(true)
    })

    it('blocks 172.16.0.0 – 172.31.255.255 (RFC-1918)', () => {
      expect(isPrivateIp('172.16.0.1')).toBe(true)
      expect(isPrivateIp('172.31.255.255')).toBe(true)
      expect(isPrivateIp('172.15.255.255')).toBe(false) // just outside
      expect(isPrivateIp('172.32.0.0')).toBe(false) // just outside
    })

    it('blocks 192.168.0.0/16 (RFC-1918)', () => {
      expect(isPrivateIp('192.168.0.1')).toBe(true)
      expect(isPrivateIp('192.168.255.255')).toBe(true)
    })

    it('blocks link-local (169.254.0.0/16)', () => {
      expect(isPrivateIp('169.254.0.1')).toBe(true)
      expect(isPrivateIp('169.254.169.254')).toBe(true) // AWS metadata endpoint
    })

    it('blocks 0.0.0.0/8', () => {
      expect(isPrivateIp('0.0.0.0')).toBe(true)
      expect(isPrivateIp('0.255.255.255')).toBe(true)
    })
  })

  describe('IPv4 public addresses that must NOT be blocked', () => {
    it('allows public IPv4 addresses', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false)       // Google DNS
      expect(isPrivateIp('1.1.1.1')).toBe(false)       // Cloudflare DNS
      expect(isPrivateIp('93.184.216.34')).toBe(false) // example.com
      expect(isPrivateIp('104.21.0.0')).toBe(false)    // Cloudflare
    })
  })

  describe('IPv6 private ranges that MUST be blocked', () => {
    it('blocks loopback (::1)', () => {
      expect(isPrivateIp('::1')).toBe(true)
    })

    it('blocks unique local (fc00::/7)', () => {
      expect(isPrivateIp('fc00::1')).toBe(true)
      expect(isPrivateIp('fd12:3456:789a::1')).toBe(true)
    })

    it('blocks link-local (fe80::/10)', () => {
      expect(isPrivateIp('fe80::1')).toBe(true)
      expect(isPrivateIp('fe80::abcd:ef01')).toBe(true)
    })

    it('blocks IPv4-mapped IPv6 in decimal form: ::ffff:10.0.0.1', () => {
      expect(isPrivateIp('::ffff:10.0.0.1')).toBe(true)
      expect(isPrivateIp('::ffff:192.168.1.1')).toBe(true)
      expect(isPrivateIp('::ffff:172.16.0.1')).toBe(true)
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
    })

    it('blocks IPv4-mapped IPv6 in hex-group form (BUG FIX): ::ffff:0a00:0001 = 10.0.0.1', () => {
      // This is the form that bypassed the original `includes("::ffff:")` check.
      expect(isPrivateIp('::ffff:0a00:0001')).toBe(true)   // 10.0.0.1
      expect(isPrivateIp('::ffff:c0a8:0001')).toBe(true)   // 192.168.0.1
      expect(isPrivateIp('::ffff:ac10:0001')).toBe(true)   // 172.16.0.1
      expect(isPrivateIp('::ffff:7f00:0001')).toBe(true)   // 127.0.0.1
      expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true)   // 169.254.169.254 (AWS metadata)
    })

    it('allows IPv4-mapped IPv6 for public IPs: ::ffff:8.8.8.8', () => {
      expect(isPrivateIp('::ffff:8.8.8.8')).toBe(false)    // Google DNS
      expect(isPrivateIp('::ffff:0808:0808')).toBe(false)  // 8.8.8.8 in hex-group
      expect(isPrivateIp('::ffff:0101:0101')).toBe(false)  // 1.1.1.1 in hex-group
    })
  })

  describe('non-IP values (defensive fallthrough)', () => {
    it('blocks anything that is neither valid IPv4 nor IPv6', () => {
      expect(isPrivateIp('not-an-ip')).toBe(true)
      expect(isPrivateIp('')).toBe(true)
      expect(isPrivateIp('999.999.999.999')).toBe(true)
    })
  })
})
