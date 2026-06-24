# MediVault — Engineering Debug & Audit Report

## Executive Summary

After a full-codebase read of every source file in `src/`, here is the
comprehensive analysis of bugs, security concerns, architecture, and test
coverage.

**Overall assessment:** This is a well-architected hackathon project with
surprisingly mature crypto and 0G integration. The existing tests are solid but
have coverage gaps. Below are the findings organized by severity.

---

## 🔴 Bugs Found

### B1. `parseRange` misses en-dash without surrounding spaces

**File:** `src/lib/health.ts` line 14

```ts
const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*[-\u2013\u2014to]+\s*(-?\d+(?:\.\d+)?)/i)
```

The regex uses `[-\u2013\u2014to]+` which means "any sequence of dash, en-dash,
em-dash, `t`, or `o` characters". This means a range like `10 to 20` works,
but a lab range like `10-20` (no spaces) also works by accident — however
`10oo20` or `10tt20` would also match because `t` and `o` are in the character
class, not the literal string `to`.

**Fix:** The `to` alternative should be a separate group, not part of the
character class.

### B2. `shortHash` off-by-one for exact threshold-length strings

**File:** `src/lib/utils.ts` line 11

```ts
if (value.length <= lead + tail + 1) return value
```

For `lead=10, tail=6`, the threshold is `17`. A string of exactly 17 characters
is returned as-is (no truncation), which is correct. But a string of 18
characters would produce `value.slice(0, 10) + '…' + value.slice(-6)` = 17
displayed chars — which is *shorter* than the original. This is a minor cosmetic
bug but could surprise users.

### B3. `parseJsonLoose` fails on text without any JSON braces

**File:** `src/lib/ai/client.ts`

```ts
const start = text.indexOf('{')
const end = text.lastIndexOf('}')
if (start !== -1 && end !== -1 && end > start) {
  text = text.slice(start, end + 1)
}
return JSON.parse(text) as T
```

If the model returns prose with no JSON at all, `start` and `end` are both `-1`,
the guard fails, and `JSON.parse` is called on the full prose text, which throws.
The caller in `extract/route.ts` catches this with a try/catch fallback, so it's
not user-facing, but it's still a fragile pattern.

### B4. `eciesDecrypt` v1 legacy path — importKey missing decrypt usage

**File:** `src/lib/og/ecies.ts` line ~130

```ts
// Legacy v1: raw SHA-256(sharedSecret) for backward compatibility.
const aesKey = await subtle().importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
```

Wait — this actually includes both `encrypt` and `decrypt`. On re-reading, the
v1 legacy path is correct. However, a more subtle issue: the v1 path uses
`importKey` without `length: 256` in the algorithm spec. While SHA-256 always
produces 32 bytes, some polyfill implementations may be stricter about the key
spec. This is a minor robustness concern, not a live bug.

### B5. `recordKey` — `hexToBytes` doesn't validate salt length

**File:** `src/lib/og/crypto.ts`

```ts
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.substr(i * 2, 2), 16)
  }
  return bytes
}
```

If `recordKeySalt` is an odd-length hex string (corrupted/malformed),
`h.length / 2` truncates, and the last nibble is silently dropped. The
resulting salt would be 15 bytes instead of 16, and `deriveRecordKey` throws
`'salt must be 16 bytes'`. The error is caught, but the salt validation should
happen earlier with a clearer message.

### B6. README says chain ID 16602 (testnet), config says 16661 (mainnet)

**File:** `README.md` vs `src/lib/og/config.ts`

The README says "0G Galileo Testnet (chain 16602)" and instructs users to add
chain ID 16602. But `config.ts` is configured for mainnet (chain ID 16661) with
mainnet RPC URLs. This mismatch means following the README setup instructions
will cause MetaMask to be on a different chain than the app expects.

**Fix:** Update the README to reflect mainnet configuration.

---

## 🟡 Security Concerns

### S1. Free KV store used as a database backend

**Files:** All `src/app/api/og/*/route.ts` files

The app uses `https://keyvalue.immanuel.co/api/KeyVal` as a free, third-party KV
store for:
- Record index pointers
- Shared record metadata
- Public key registry
- Consent ledger entries
- Anchor records
- Share envelope caching

This is a free third-party service with no auth, rate limits, or SLA. If it goes
down or deletes data, the app loses its metadata layer (though the encrypted
records on 0G storage remain intact). For a hackathon, this is acceptable. For
production, this should be replaced with 0G-KV or a proper database.

### S2. Auth cache stored in sessionStorage

**File:** `src/lib/client/auth.ts`

```ts
function cacheKey(address: string): string {
  return `${AUTH_CACHE_PREFIX}:${address.toLowerCase()}`
}
```

The auth header (containing a wallet signature) is cached in `sessionStorage`
for 70s. While the comment correctly notes this is under the server's 90s
window, `sessionStorage` is accessible to XSS. A more robust approach would
keep the cache in memory only (module-level variable), similar to how
`cachedMasterSeed` was moved from `sessionStorage` to memory.

### S3. No CSRF protection on API routes

All POST endpoints accept any origin. While the CSP in `next.config.mjs` sets
`frame-ancestors 'none'` and `default-src 'self'`, there's no explicit CSRF
token validation. The wallet-signature-based auth provides some CSRF resistance
(an attacker can't forge a valid signature without the wallet), but the
sessionStorage caching means a same-tab XSS could replay the cached header.

### S4. `eth_sendRawTransaction` blocked in RPC proxy — but the 0G SDK calls RPC directly

**File:** `src/app/api/og/rpc/route.ts` (and `config.ts`)

The RPC proxy correctly blocks `eth_sendRawTransaction`, but `config.ts` sets
`RPC_URL` to `https://evmrpc.0g.ai` (direct), meaning the 0G SDK bypasses the
proxy entirely for upload transactions. This is by design (the comment explains
why), but it means the proxy's write-blocking is a control-plane feature only,
not an actual security boundary.

---

## 🟢 Architectural Strengths

1. **Clean adapter pattern** — `StorageAdapter` and `IndexAdapter` interfaces
   cleanly separate 0G storage and KV index concerns.

2. **Mature upload retry logic** — The `uploadWithRetry` method in
   `storage-adapter.ts` handles stuck nonces, gas escalation, sync timeouts,
   duplicate submissions, and transient network errors. This is production-
   grade resilience logic.

3. **Per-record key derivation via HKDF** — Each record gets its own AES-256
   key derived from the master key + a per-record salt, so compromising one
   record's key never reveals others.

4. **ECIES with HKDF domain separation** — The v2 ECIES envelope uses
   HKDF-SHA256 with a domain-specific `info` parameter, preventing cross-protocol
   attacks.

5. **Hash-chained consent ledger** — The `verifyConsentChain` function
   detects any insertion, deletion, or modification of ledger entries.

6. **Selective disclosure proofs** — Signed, time-bound, field-specific proofs
   that commit to a record's 0G root hash without revealing the full record.

7. **Prompt injection guard** — The chat route wraps record context in
   `<untrusted_record_data>` tags with explicit instructions to ignore embedded
   instructions.

8. **Rate limiting** — Per-address, per-action rate limits on AI, parse, chat,
   and RPC endpoints.

---

## Test Coverage Analysis

### Existing tests (4 files)

| File | Coverage | Notes |
|------|----------|-------|
| `health.test.ts` | Partial | Tests parseNumeric, parseRange, collectLabSeries. Missing: upcomingFollowUps, timelineEvents, buildEmergencyProfile |
| `utils.test.ts` | Partial | Tests shortHash, formatBytes, classifyFlag, extensionForMime. Missing: formatDate, formatRelative, fileKind, downloadFileName |
| `integration.test.ts` | E2E | Full lifecycle: key derivation, ECIES, disclosure proofs, consent ledger |
| `stress.test.ts` | Benchmark + stress | 100-key derivation, 20 concurrent ECIES, 50-entry ledger, 1MB ECIES |

### New tests added in this commit

| File | Coverage Added |
|------|---------------|
| `health.test.ts` (expanded) | upcomingFollowUps, timelineEvents, buildEmergencyProfile, parseRange en-dash edge cases |
| `utils.test.ts` (expanded) | formatDate, formatRelative, formatBytes edge cases, isTextLike, isImageMime, fileKind, downloadFileName |
| `normalize.test.ts` (new) | normalizeExtraction: empty input, missing fields, type coercion, flag resolution, confidence clamping |
| `parseJsonLoose.test.ts` (new) | parseJsonLoose: fenced JSON, prose+JSON, no-JSON failure, nested objects |
| `crypto.test.ts` (new) | recordKey legacy path, deriveRecordKey salt validation, saltToHex/round-trip, hexToBytes edge cases |
| `ecies.test.ts` (new) | ECIES v2 encrypt/decrypt round-trip, wrong-key failure, v1-v2 interop |
| `disclosure.test.ts` (new) | verifyProof: valid, expired, tampered, malformed; encode/decode round-trip; claimMessage determinism |
| `anchor.test.ts` (new) | buildAnchorData/parseAnchorData round-trip, invalid inputs, prefix validation |

---

## Recommendations

### Immediate (pre-production)
1. Update README to reflect mainnet config (chain ID 16661, mainnet RPC)
2. Fix `parseRange` regex to use explicit `to` alternative instead of char class
3. Move auth header cache from sessionStorage to in-memory variable
4. Add salt length validation with clear error in `recordKey`/`hexToBytes`
5. Add tests for `upcomingFollowUps`, `timelineEvents`, `buildEmergencyProfile`

### Medium-term
1. Replace free KV store with self-hosted 0G-KV or Firebase/Supabase
2. Add CSRF token or SameSite cookie in addition to wallet auth
3. Add integration test that exercises the full upload→download→verify cycle
   against a local mock 0G indexer
4. Add `eslint-plugin-security` to CI

### Long-term
1. Implement key rotation flow (new salt → re-encrypt → re-upload → update index)
2. Add ZK proof of consistency between disclosed fields and encrypted ciphertext
3. Implement the roadmap items from README (ACLs, re-encryption, mobile app)
