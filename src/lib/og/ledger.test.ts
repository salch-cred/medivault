import { describe, it, expect } from 'vitest'
import {
  computeEntryHash,
  verifyConsentChain,
  isAnchoredToGenesis,
  GENESIS_HASH,
  type ConsentEvent,
  type ConsentEventCore,
} from './ledger'

describe('consent ledger utilities', () => {
  function makeEntry(
    overrides: Partial<ConsentEventCore> = {},
    prevHash: string = GENESIS_HASH,
  ): ConsentEventCore {
    return {
      id: 'test_id',
      ts: new Date().toISOString(),
      type: 'grant',
      actor: '0x' + 'ab'.repeat(20),
      recipient: '0x' + 'cd'.repeat(20),
      recordTitle: 'Lab Report',
      recordRootHash: '0x' + 'ef'.repeat(32),
      prevHash,
      ...overrides,
    }
  }

  describe('computeEntryHash', () => {
    it('produces a 0x-prefixed keccak256 hash', () => {
      const entry = makeEntry()
      const hash = computeEntryHash(entry)
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/)
    })

    it('is deterministic for identical entries', () => {
      const entry = makeEntry()
      expect(computeEntryHash(entry)).toBe(computeEntryHash(entry))
    })

    it('changes when any field changes', () => {
      const base = makeEntry()
      const modified = makeEntry({ recordTitle: 'Different' })
      expect(computeEntryHash(base)).not.toBe(computeEntryHash(modified))
    })

    it('changes when prevHash changes', () => {
      const entry1 = makeEntry({}, '0x' + '11'.repeat(32))
      const entry2 = makeEntry({}, '0x' + '22'.repeat(32))
      expect(computeEntryHash(entry1)).not.toBe(computeEntryHash(entry2))
    })
  })

  describe('verifyConsentChain', () => {
    it('verifies a valid single-entry chain', () => {
      const core = makeEntry()
      const entryHash = computeEntryHash(core)
      const chain: ConsentEvent[] = [{ ...core, entryHash }]
      const result = verifyConsentChain(chain)
      expect(result.ok).toBe(true)
      expect(result.brokenAt).toBeNull()
    })

    it('verifies a valid multi-entry chain', () => {
      const e1Core = makeEntry({ id: 'e1' })
      const e1Hash = computeEntryHash(e1Core)
      const e2Core = makeEntry({ id: 'e2' }, e1Hash)
      const e2Hash = computeEntryHash(e2Core)
      const chain: ConsentEvent[] = [
        { ...e1Core, entryHash: e1Hash },
        { ...e2Core, entryHash: e2Hash },
      ]
      const result = verifyConsentChain(chain)
      expect(result.ok).toBe(true)
    })

    it('detects a tampered entry hash', () => {
      const core = makeEntry()
      const wrongHash = '0x' + 'ff'.repeat(32)
      const chain: ConsentEvent[] = [{ ...core, entryHash: wrongHash }]
      const result = verifyConsentChain(chain)
      expect(result.ok).toBe(false)
      expect(result.brokenAt).toBe(0)
    })

    it('detects a broken prevHash link', () => {
      const e1Core = makeEntry({ id: 'e1' })
      const e1Hash = computeEntryHash(e1Core)
      const e2Core = makeEntry({ id: 'e2' }, '0x' + '00'.repeat(32)) // wrong prevHash
      const e2Hash = computeEntryHash(e2Core)
      const chain: ConsentEvent[] = [
        { ...e1Core, entryHash: e1Hash },
        { ...e2Core, entryHash: e2Hash },
      ]
      const result = verifyConsentChain(chain)
      expect(result.ok).toBe(false)
      expect(result.brokenAt).toBe(1)
    })

    it('verifies an empty chain as valid', () => {
      const result = verifyConsentChain([])
      expect(result.ok).toBe(true)
      expect(result.brokenAt).toBeNull()
    })

    it('detects tampering in a field in the middle of the chain', () => {
      const e1Core = makeEntry({ id: 'e1' })
      const e1Hash = computeEntryHash(e1Core)
      const e2Core = makeEntry({ id: 'e2' }, e1Hash)
      const e2Hash = computeEntryHash(e2Core)
      const e3Core = makeEntry({ id: 'e3' }, e2Hash)
      const e3Hash = computeEntryHash(e3Core)

      const chain: ConsentEvent[] = [
        { ...e1Core, entryHash: e1Hash },
        { ...e2Core, entryHash: e2Hash },
        { ...e3Core, entryHash: e3Hash },
      ]

      // Tamper with entry 1's recordTitle (changes its computed hash but not its
      // stored entryHash, so verification at index 1 should detect the mismatch)
      const tampered = JSON.parse(JSON.stringify(chain))
      tampered[1].recordTitle = 'TAMPERED'
      const result = verifyConsentChain(tampered)
      expect(result.ok).toBe(false)
      expect(result.brokenAt).toBe(1)
    })
  })

  describe('isAnchoredToGenesis', () => {
    it('returns true for an empty chain', () => {
      expect(isAnchoredToGenesis([])).toBe(true)
    })

    it('returns true when first entry prevHash is GENESIS_HASH', () => {
      const core = makeEntry({}, GENESIS_HASH)
      const hash = computeEntryHash(core)
      expect(isAnchoredToGenesis([{ ...core, entryHash: hash }])).toBe(true)
    })

    it('returns false when first entry prevHash is not GENESIS_HASH', () => {
      const core = makeEntry({}, '0x' + 'ff'.repeat(32))
      const hash = computeEntryHash(core)
      expect(isAnchoredToGenesis([{ ...core, entryHash: hash }])).toBe(false)
    })
  })

  it('GENESIS_HASH is 64 hex zeros with 0x prefix', () => {
    expect(GENESIS_HASH).toBe('0x' + '0'.repeat(64))
  })
})
