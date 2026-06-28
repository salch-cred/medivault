# MediVault — Full Product Specification

> **For the 0G Zero Cup 2026 · Built by Sahil & Sal**
> Live at: https://medivault-ecru.vercel.app
> Repo: https://github.com/salch-cred/medivault

---

## 0. Brand

### Name: MediVault

**Medi** — medicine, health, the most personal domain of human life.
**Vault** — a fortress. Impenetrable. Yours alone. The only person who opens it is you.

Combined: **MediVault** = your medical records in a vault that only your wallet key can open.

No company password reset. No "forgot my login". No "we had a data breach, we're sorry".
Your records are as permanent and private as your wallet private key.

### Tagline
> *"Your health history, cryptographically yours."*

### Alternative taglines
- *"Encrypt once. Own forever."*
- *"No hospital. No company. Just your wallet."*
- *"The only health app that can't read your records."*

### Why this matters — the emotional core
Every year, patients arrive at emergency rooms unable to recall their medications, allergies, or prior diagnoses — because their records are scattered across systems they don't control.

A grandmother who has seen 12 doctors in 30 years has records in 12 different portals. None of them talk to each other. She has to remember everything herself. That's not healthcare — that's chaos.

MediVault fixes this with one principle: **your wallet = your vault = your health history**. Connect your MetaMask on any device, anywhere in the world, and your complete medical history appears. Encrypted. Yours. Permanent.

---

## 1. Vision — Why We Built This

### The problem, stated precisely

Medical records are the most important documents a person owns — yet they are the worst managed.

| Pain point | Reality today |
|---|---|
| **Scattered** | Spread across clinic portals, PDFs, emails, and paper printouts |
| **Confusing** | Written in dense medical jargon most patients can't parse |
| **Risky to store** | Uploading to Google Drive means trusting a company forever |
| **Unshareable** | No secure, instant way to hand a record to a new doctor |
| **Owned by others** | Hospitals and labs hold your data — you just get access when they allow it |

### Existing solutions and why they fail

| Solution | Why it fails |
|---|---|
| **Google Drive / Dropbox** | Company can read your files, can be breached, can delete your account |
| **Hospital patient portals** | Each hospital has a separate portal. No cross-hospital view. Provider-controlled. |
| **Health apps (Apple Health, etc.)** | Centralized, US-centric, doctor-side, no encryption you control |
| **Generic doc AI (ChatPDF, etc.)** | Uploads your raw medical files to a server. Privacy nightmare. |
| **Crypto "health" projects** | Either no real AI, no real encryption, or no real storage. Bolt-ons. |

### MediVault's differentiated position

> **Unlike generic document tools or clinical scribes — MediVault is 100% patient-owned.
> No doctor, no hospital, no company can access your records.
> Only your wallet key decrypts them. Ever.**

---

## 2. Core Architecture — How It Works

### The Five-Step Flow

```
1. Connect MetaMask wallet
        │
        ▼
   sign(fixedMessage) ──► AES-256 key derived IN BROWSER
                                │
                          Never stored. Never sent. Never logged.

2. Upload any document (PDF, image, scan)
        │
        ▼
   pdf-parse / tesseract.js OCR (client-side)
        │
        ▼
3. 0G Compute AI analysis
   - Plain-language summary
   - Extract: conditions / medications / allergies / dosages / red flags
   - Urgency flagging
   - Multi-language support
        │
        ▼
4. AES-256 encrypt in browser → ciphertext only leaves device
        │
        ▼
   0G Storage ──► Merkle root hash (ownership handle)
   0G-KV      ──► vault index per wallet address
   0G Chain   ──► anchor calldata (tamper-proof)
        │
        ▼
5. Access from ANY device
   Connect wallet → full vault appears
   No login. No server. No backup needed.
```

### 0G Integration Map — Why Every Primitive is Load-Bearing

| 0G Primitive | What MediVault uses it for | Remove it and… |
|---|---|---|
| **0G Storage** | AES-256 encrypted ciphertext upload; Merkle root = ownership handle | No vault — nowhere decentralised/censorship-resistant to keep ciphertext |
| **0G Compute** | AI summaries, extraction, urgency flags — TEE-backed inference | No AI analysis — core feature disappears |
| **0G-KV** | Vault index per wallet address — cross-device record lookup | No cross-device access — vault only works on one device |
| **0G Chain** | Tamper-proof anchor calldata; consent audit events | No immutable audit trail — sharing and proof features break |

> **Remove 0G and MediVault cannot function. This is not a bolt-on.**

### Storage & Index Adapter Pattern

All 0G I/O is isolated behind clean interfaces in `src/lib/og/`:

```typescript
// Storage adapter — upload, download, share, verify
interface StorageAdapter {
  uploadEncrypted(file: File, key: CryptoKey): Promise<string>      // returns rootHash
  downloadDecrypted(rootHash: string, key: CryptoKey): Promise<Blob>
  shareToRecipient(rootHash: string, recipientPubKey: string): Promise<void>
  verifyIntegrity(rootHash: string): Promise<boolean>
}

// Index adapter — read/write vault index per wallet
interface IndexAdapter {
  put(walletAddress: string, record: RecordMeta): Promise<void>
  list(walletAddress: string): Promise<RecordMeta[]>
  get(walletAddress: string, rootHash: string): Promise<RecordMeta | null>
}
```

> No mocks. No stubs. Both interfaces have exactly one implementation — the real 0G SDK.

---

## 3. Encryption Model — The Security Foundation

### Key Derivation

```
User's MetaMask wallet
        │
        ▼
  sign("MediVault Key Derivation v1")   ← fixed deterministic message
        │
        ▼
  signature bytes
        │
        ▼
  PBKDF2 / HKDF derivation
        │
        ▼
  AES-256-GCM key  ←  NEVER stored, NEVER sent to server, NEVER logged
        │
        ▼
  Encrypts EVERY record before it leaves the browser
```

### Why this is better than password-based encryption

| Property | Password-based | Wallet-based (MediVault) |
|---|---|---|
| **Brute-forceable?** | Yes (dictionary attacks) | No (256-bit ECDSA key) |
| **Recoverable without user?** | Via "forgot password" → company has a backdoor | ❌ Impossible — only the wallet owner can |
| **Cross-device?** | Needs password sync | ✅ Deterministic — same wallet = same key |
| **Phishable?** | Yes | No — derived from wallet signing, not a secret string |

### ECIES Doctor Sharing

```
Owner decides to share record with Doctor wallet 0xABC...
        │
        ▼
  Fetch doctor's public key from chain
        │
        ▼
  ECIES: generate ephemeral keypair
  Derive shared secret = ECDH(ephemeralPriv, doctorPub)
  Re-encrypt record ciphertext → new envelope
        │
        ▼
  Upload to 0G Storage → new rootHash
  Write share event → 0G Chain consent ledger
        │
        ▼
  Doctor connects wallet → decrypts with their private key
  Server NEVER had the plaintext
```

### Consent Ledger

Every share event is written to an immutable, hash-chained audit trail on 0G Chain:
```
ConsentEvent {
  walletAddress: string       // who shared
  recipientAddress: string    // who received
  recordRootHash: string      // which record
  timestamp: number           // when
  previousEventHash: string   // chain link (tamper-proof)
}
```

This is forensic-grade evidence. No hospital consent management system does this on-chain.

---

## 4. AI Intelligence Layer — 0G Compute Integration

### What the AI does with every uploaded document

```
Extracted text (OCR / PDF)
        │
        ▼
  0G Compute Router (router-api.0g.ai/v1)
  ↳ OpenAI-compatible API
  ↳ TEE-backed inference
  ↳ GLM-5.2 / Qwen model
        │
        ▼
  Returns:
    summary: string              // plain-language explanation
    conditions: string[]         // medical conditions found
    medications: string[]        // medications + dosages
    allergies: string[]          // allergens identified
    redFlags: string[]           // urgent items
    urgencyLevel: 'low' | 'medium' | 'high' | 'critical'
    labValues: LabValue[]        // numeric values + reference ranges
    language: string             // detected language
```

### AI Features

| Feature | Description |
|---|---|
| **Plain-language summary** | Dense medical jargon decoded into clear human-readable explanation |
| **Smart extraction** | Conditions, medications, allergies, dosages, red flags |
| **Urgency flagging** | Highlights anything needing immediate attention |
| **"Explain like I'm 5" mode** | Simplest possible explanation toggle |
| **Multi-language** | Summaries in the language the patient understands |
| **Vault-wide AI chat** | Ask questions across your entire record history |
| **Lab trend analysis** | AI interprets whether values are trending up/down over time |

### Why 0G Compute — not OpenAI, not Anthropic

| Property | Centralised AI (OpenAI/etc.) | 0G Compute |
|---|---|---|
| **Sees your medical data?** | ✅ Yes — plaintext sent to their servers | ❌ No — TEE-enclave, zero knowledge |
| **Verifiable?** | ❌ No proof it was AI | ✅ TEE attestation per response |
| **Censorship-resistant?** | ❌ Can be shut down or restricted | ✅ Decentralised compute network |
| **Data stored by provider?** | ✅ Typically used for training | ❌ TEE memory cleared after inference |

---

## 5. Feature Specification

### 5.1 Vault Core

**F-01: Wallet-native identity**
- Connect MetaMask → AES-256 key derived in-browser
- No email. No password. No account. No recovery by design.
- DoD: user connects wallet → vault loads → records decrypted

**F-02: Multi-format document upload**
- PDF parsing via `pdf-parse` (server-side)
- Image OCR via `tesseract.js` (client-side)
- Supported formats: PDF, JPG, PNG, HEIC, TIFF
- DoD: user uploads a PDF lab report → text extracted → AI summary shown

**F-03: Encrypted storage on 0G**
- AES-256 encryption in browser before upload
- Merkle root hash returned = ownership handle
- Content-addressed deduplication (same file = same hash, no re-upload)
- DoD: rootHash verifiable on 0G Storage Explorer

**F-04: Vault index on 0G-KV**
- Record metadata indexed in 0G-KV keyed by wallet address
- Cross-device: connect same wallet on any device → same vault
- DoD: upload on device A → see record on device B

**F-05: On-chain anchor**
- Vault index root anchored to 0G Chain via calldata
- Tamper-proof — any change to the vault index breaks the anchor
- DoD: anchor tx visible on chainscan.0g.ai

### 5.2 AI Features

**F-06: AI health summary via 0G Compute**
- Submitted text → 0G Compute → structured analysis
- Summary + conditions + medications + allergies + urgency
- DoD: upload blood test → AI returns conditions array + plain summary

**F-07: Lab trend charts**
- Numeric lab values plotted over time
- Reference range overlay (normal / abnormal / critical)
- DoD: 3+ blood tests uploaded → haemoglobin trend chart visible

**F-08: Vault-wide AI chat**
- Ask natural language questions across all records
- AI cites the exact source document
- DoD: "what medications am I on?" → answer with doc citations

### 5.3 Sharing & Verification

**F-09: ECIES doctor sharing**
- ECIES re-encryption to recipient wallet
- Server never sees plaintext
- DoD: share to wallet → recipient decrypts → original owner still has access

**F-10: Emergency QR card**
- One-tap QR with blood type, allergies, critical medications
- Scannable by any doctor, saveable to phone lock screen
- DoD: QR generated → scanned on different phone → health data visible

**F-11: Consent ledger**
- Every share event written to hash-chained audit trail on 0G Chain
- DoD: share record → event visible on chain explorer

**F-12: Root hash verifier (`/verify`)**
- Tab 1: Enter any rootHash → 4 live checks against 0G Network
- Tab 2: Paste selective disclosure proof → verified client-side
- DoD: paste valid rootHash → 4 green checkmarks shown

**F-13: Selective disclosure proofs**
- Prove one fact ("I am vaccinated") without revealing full record
- Signed by wallet, verifiable by anyone at `/verify`
- DoD: generate proof → share link → recipient verifies without wallet

### 5.4 Mobile & Offline

**F-14: PWA (Progressive Web App)**
- Install from browser on iOS / Android — no app store
- Service worker caches app shell
- DoD: "Add to Home Screen" on iOS → app icon appears → works offline

**F-15: QR scanner**
- Scan shared health QR codes from mobile camera
- Uses `jsqr` for cross-browser compatibility (fixed for iOS Safari)
- DoD: scan QR on iOS Safari → health data displayed

---

## 6. Security Model

### Threat Model

| Threat | MediVault's Defence |
|---|---|
| **Attacker compromises our server** | Server only ever sees AES-256 ciphertext. Plaintext never touches backend. |
| **Attacker gets our database** | No database of health records. All records are on 0G Storage, encrypted. |
| **Attacker phishes user's password** | There is no password. Only the wallet private key decrypts records. |
| **Service shuts down** | Records are on 0G Storage (permanent). Vault is self-hostable. |
| **Government demands user data** | We cannot produce what we don't have. Zero-knowledge architecture. |
| **Doctor/recipient shares record further** | Consent ledger on 0G Chain shows who accessed what. |

### Security Properties

```
┌─────────────────────────────────────────────────────────┐
│  BROWSER (trusted)                                      │
│                                                         │
│  AES-256 key (derived from wallet signature)            │
│  Encryption happens HERE                                │
│  Decryption happens HERE                                │
│  Key NEVER leaves this box                              │
└──────────────────────┬──────────────────────────────────┘
                       │ ciphertext only
                       ▼
┌─────────────────────────────────────────────────────────┐
│  MediVault Server (zero-knowledge)                      │
│                                                         │
│  Receives: ciphertext blobs, wallet addresses           │
│  Sends to 0G: ciphertext blobs                          │
│  Sends to 0G Compute: OCR text (pre-encryption)         │
│  Knows: nothing about your health                       │
└──────────────────────┬──────────────────────────────────┘
                       │ ciphertext
                       ▼
┌─────────────────────────────────────────────────────────┐
│  0G Network (decentralised, permanent)                  │
│                                                         │
│  0G Storage: encrypted files (ciphertext only)          │
│  0G-KV: encrypted index (ciphertext only)               │
│  0G Chain: public event log (rootHashes, timestamps)    │
│  0G Compute: TEE inference (memory cleared after)       │
└─────────────────────────────────────────────────────────┘
```

### Rate Limiting
- Hybrid L1 in-process + L2 KV-backed rate limiter on all public API endpoints
- Prevents abuse of 0G Compute (costly inference)
- Per-wallet-address limits on vault operations

### No Recovery By Design
> Lose your wallet → lose your vault.
> No admin override. No "forgot my key" flow.
> This is a feature, not a bug — it is the only way to guarantee true zero-knowledge.

---

## 7. Competitive Positioning

### vs Generic Document AI (ChatPDF, etc.)
```
ChatPDF:  Upload PDF → their server reads it → AI trained on your data
MediVault: Upload PDF → OCR on OUR server (pre-encryption) → AI via 0G Compute TEE
           → encrypted IN YOUR BROWSER → stored on 0G → they never see plaintext
```

### vs Other Zero Cup Projects

**vs g0ldem (iNFT gaming — testnet)**
```
g0ldem:    Ownable AI golems as iNFTs — fun, innovative, gaming niche
           ↳ Testnet (Galileo) only. Remove 0G = no ownership proof.
MediVault: Ownable health records — affects 8 billion people
           ↳ MAINNET (chain 16661). Remove 0G = no vault. Period.
```

**vs scribezero (health scribe — testnet)**
```
scribezero: Doctor-side scribe — turns doctor's voice notes into SOAP notes
            ↳ Testnet + mock fallback. Needs env vars to go real.
MediVault:  Patient-side vault — patient OWNS the records, not the doctor
            ↳ MAINNET, always live, no mock mode. 267 Vercel deploys.
```

**vs vaultmind (generic doc AI — local dev)**
```
vaultmind:  Generic document chat — like ChatPDF but encrypted
            ↳ Defaults to LOCAL DEV mode. Stopped development June 23.
MediVault:  Healthcare-specific — OCR, lab charts, emergency QR, doctor sharing
            ↳ Production mainnet. Actively developed.
```

### The Healthcare Moat

Healthcare is the ONE domain where:
- The data is the most sensitive (more than financial, more than private messages)
- The need is universal (8 billion people have health records)
- The existing solutions are the most broken (fragmented, hospital-controlled)
- The encryption matters most (medical data commands highest dark web price)
- The real-world impact is most immediate (wrong medication = death)

No other Zero Cup project operates in this space with:
✅ Patient ownership (not doctor-side, not hospital-side)
✅ Real encryption (not just "we say we're secure")
✅ Real 0G Mainnet (not testnet)
✅ Real AI via 0G Compute (not a local LLM)
✅ Emergency QR card (literal life-or-death feature)

---

## 8. Architecture Diagrams

### Upload Flow
```
User                Browser              MediVault API        0G Network
 ┤                     ┤                      ┤                    ┤
 ├──select file──────►┤                       ┤                    ┤
 ┤                    ├──OCR / pdf-parse──────►┤                   ┤
 ┤                    ┤◄──extracted text───────┤                   ┤
 ┤                    ├──0G Compute req────────────────────────────►┤
 ┤                    ┤◄──AI analysis + proof──────────────────────┤
 ┤                    ├──AES-256 encrypt (local, key never leaves)  ┤
 ┤                    ├──upload ciphertext─────►┤                  ┤
 ┤                    ┤                         ├──0G Storage───────►┤
 ┤                    ┤                         ┤◄──rootHash────────┤
 ┤                    ┤                         ├──0G-KV update─────►┤
 ┤                    ┤                         ├──0G Chain anchor──►┤
 ┤                    ┤◄──rootHash──────────────┤                   ┤
 ├◄──record saved────┤                          ┤                   ┤
```

### Verify Flow
```
Anyone              /verify page         /api/og/verify       0G Network
 ┤                     ┤                      ┤                    ┤
 ├──paste rootHash───►┤                       ┤                    ┤
 ┤                    ├──GET /verify?hash=────►┤                   ┤
 ┤                    ┤                        ├──check chain───────►┤
 ┤                    ┤                        ├──peekHeader────────►┤
 ┤                    ┤                        ├──node count────────►┤
 ┤                    ┤◄──4 checks result───────┤                   ┤
 ├◄──✅ verified──────┤                         ┤                   ┤
```

### Doctor Sharing Flow
```
Owner               Browser              0G Network           Doctor
 ┤                     ┤                      ┤                   ┤
 ├──share to wallet──►┤                       ┤                   ┤
 ┤                    ├──fetch doctor pubkey───────────────────────►┤
 ┤                    ┤◄──doctor pubkey────────────────────────────┤
 ┤                    ├──ECIES re-encrypt (local)                   ┤
 ┤                    ├──upload envelope──────►┤                   ┤
 ┤                    ┤                        ├──0G Storage────────►┤
 ┤                    ┤                        ├──consent event─────►┤
 ┤                    ┤◄──new rootHash─────────┤                   ┤
 ┤                    ┤                        ┤                   ├──connect wallet
 ┤                    ┤                        ┤◄──fetch envelope──┤
 ┤                    ┤                        ┤──decrypt (local)──►┤
 ┤                    ┤                        ┤                   ├──sees plaintext
```

---

## 9. File Structure

```
medivault/
├── SPEC.md                         # this file
├── AGENTS.md                       # AI agent context for MCP integrations
├── README.md                       # public-facing overview
│
├── src/
│   ├── app/
│   │   ├── page.tsx                # landing page
│   │   ├── vault/                  # main vault UI
│   │   ├── verify/                 # dual-tab verifier (rootHash + proof)
│   │   ├── scan/                   # QR scanner
│   │   ├── timeline/               # health timeline view
│   │   └── api/og/
│   │       ├── health/             # GET /api/og/health — live 0G status
│   │       ├── verify/             # GET /api/og/verify — rootHash check
│   │       ├── anchor/             # GET /api/og/anchor — chain anchor
│   │       ├── index/              # POST /api/og/index — KV vault index
│   │       ├── share/              # POST /api/og/share — ECIES share
│   │       └── pubkey/             # GET /api/og/pubkey — recipient pubkey
│   │
│   ├── lib/
│   │   ├── og/
│   │   │   ├── config.ts           # 0G network constants (mainnet)
│   │   │   ├── storage-adapter.ts  # 0G Storage: upload / download / share
│   │   │   ├── kv-index-adapter.ts # 0G-KV: vault index per wallet
│   │   │   ├── anchor.ts           # 0G Chain: calldata anchor
│   │   │   ├── ledger.ts           # 0G Chain: consent audit events
│   │   │   ├── crypto.ts           # AES-256 encryption / ECIES
│   │   │   ├── disclosure.ts       # selective disclosure proofs
│   │   │   └── types.ts            # shared types
│   │   │
│   │   └── ai/
│   │       ├── client.ts           # 0G Compute OpenAI-compatible client
│   │       ├── prompts.ts          # extraction prompt templates
│   │       └── parser.ts           # structured response parsing
│   │
│   └── components/
│       ├── vault/                  # vault record cards, upload UI
│       ├── ai/                     # summary display, chat UI
│       ├── sharing/                # QR card, doctor share modal
│       └── ui/                     # shadcn/ui components
│
├── docs/
│   └── screenshots/               # demo screenshots (desktop + mobile)
│
└── public/
    ├── manifest.json               # PWA manifest
    └── sw.js                       # service worker
```

---

## 10. Tech Stack — Decisions and Rationale

| Layer | Technology | Why |
|---|---|---|
| **Framework** | Next.js 14 App Router | SSR + API routes + stable, production-tested |
| **Language** | TypeScript (strict) | Type safety across 0G SDK types |
| **Blockchain** | 0G Mainnet (chain 16661) | Only Zero Cup health project on mainnet |
| **Storage** | `@0gfoundation/0g-storage-ts-sdk` | Real 0G Storage, not IPFS, not S3 |
| **AI** | 0G Compute Router (`router-api.0g.ai/v1`) | TEE-backed, OpenAI-compatible, no centralised cloud |
| **Wallet** | MetaMask + Web3Modal / WalletConnect | Universal Web3 wallet support |
| **Encryption** | AES-256 + ECIES via 0G SDK | Industry-standard, browser-native WebCrypto API |
| **OCR** | `tesseract.js` (client-side) | Scan handwritten prescriptions without uploading raw image |
| **PDF** | `pdf-parse` (server-side) | Extract text from lab report PDFs |
| **QR** | `jsqr` (cross-browser) | No native API dependency, works on iOS Safari |
| **UI** | Tailwind CSS + shadcn/ui | Fast, accessible, consistent |
| **Animation** | Framer Motion | Smooth vault interactions |
| **PWA** | Service Worker + Web App Manifest | Offline-first, installable from browser |
| **Deploy** | Vercel (267 production deploys) | Edge functions, automatic deploys on push |

---

## 11. 0G Network Configuration (Mainnet)

```typescript
// src/lib/og/config.ts
export const ZG = {
  // 0G Mainnet
  CHAIN_ID:          16661,
  RPC_URL:           'https://evmrpc.0g.ai',
  BLOCK_EXPLORER:    'https://chainscan.0g.ai',

  // 0G Storage
  INDEXER_RPC:       'https://indexer-storage-turbo.0g.ai',
  STORAGE_EXPLORER:  'https://storagescan.0g.ai',

  // 0G Compute
  COMPUTE_ROUTER:    'https://router-api.0g.ai/v1',

  // 0G Chain contracts
  FLOW_CONTRACT:     '0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526',
} as const
```

> **Note:** MediVault is on 0G MAINNET (chain 16661). Not Galileo testnet (chain 16602). This is the production network.

---

## 12. Definition of Done (DoD) — Per Feature

### Phase 1 — Vault Core (✅ Shipped — Group Stage)
- [x] Connect wallet → AES-256 key derived in browser (never stored)
- [x] Upload PDF / image → OCR + pdf-parse → AI summary via 0G Compute
- [x] Encrypt in browser → upload ciphertext to 0G Storage → rootHash returned
- [x] Vault index stored in 0G-KV per wallet address
- [x] Vault index anchored to 0G Chain (calldata)
- [x] Cross-device: connect same wallet → same vault
- [x] ECIES doctor sharing → consent event on 0G Chain
- [x] Emergency QR card (blood type, allergies, medications)
- [x] QR scanner (mobile, iOS Safari safe)
- [x] PWA — installable from browser, offline-ready
- [x] Health timeline + lab trend charts
- [x] Vault-wide AI chat with source citations
- [x] Deployed on 0G Mainnet (chain 16661)

### Phase 2 — Verification Layer (✅ Shipped — Round of 32)
- [x] `/verify` dual-tab: rootHash live check + proof token verifier
- [x] `/api/og/verify` server-side 4-step 0G rootHash verification
- [x] `AGENTS.md` — AI-readable project context for MCP agents
- [x] GitHub topic tags for discoverability

### Phase 3 — Smart Contract + Shareable Cards (🔜 Round of 16, by July 3)
- [ ] `MedVaultRegistry.sol` — ERC-721 deployed on 0G Mainnet
  - Mint "Vault Activated" NFT on first vault creation
  - NFT metadata points to vault root hash on 0G Storage
  - Proves on-chain vault creation timestamp
- [ ] `/card/[hash]` — shareable verified health record card
  - Beautiful OG image (for Twitter/social preview)
  - Shows: record type, 0G root hash, verification status, mainnet block
  - Shareable link without wallet connection
- [ ] SPEC.md, ARCHITECTURE.md, SECURITY.md complete

### Phase 4 — MCP Server + Community (🔜 July 8 final lock)
- [ ] `/api/mcp` — MCP server endpoint (Model Context Protocol)
  - Expose MediVault as a tool for AI agents
  - Tool: `verify_health_record(rootHash)` → verification result
  - Tool: `get_vault_status(walletAddress)` → vault stats
- [ ] Community campaign — Twitter, Discord, Reddit, LinkedIn
- [ ] 3 GIFs recorded and added to README

---

## 13. Roadmap Summary

```
JUN 24 ──► Group Stage submit
           ✅ Full vault, AI, encryption, sharing, QR, PWA, mainnet

JUN 28 ──► Round of 32 submit (TODAY)
           ✅ /verify page, /api/og/verify, AGENTS.md, SPEC.md
           ✅ README: Round of 32 badges + roadmap + differentiation

JUL 3  ──► Round of 16 submit
           🔜 MedVaultRegistry.sol (ERC-721 on 0G Mainnet)
           🔜 /card/[hash] shareable verified card
           🔜 3 GIFs in README
           🔜 Real on-chain evidence section in README

JUL 8  ──► Final snapshot lock
           🔜 MCP server endpoint
           🔜 /api/og/verify enhanced with ZK proof
           🔜 Community vote campaign live

JUL 16-18 ► Community voting
            🔜 Twitter campaign, Discord, Reddit, LinkedIn
            🔜 Shareable card viral push

JUL 19 ──► Champion announced 🏆
```

---

## 14. The 30-Second Demo Script

> *The judge has 30 seconds. This is the story we tell.*

**"Open your phone. Upload your blood test PDF.**
**Watch AI tell you in plain English what it means.**
**It's encrypted in your browser — not our server, not Google, not anyone.**
**Then stored on 0G Network forever.**
**Generate a QR emergency card.**
**If you're in an ambulance and can't speak,**
**a doctor scans it and sees your blood type, allergies, medications — instantly.**
**Your entire health history.**
**Yours.**
**Verifiable.**
**Permanent.**
**In your pocket.**
**Only your wallet key decrypts it.**
**Ever."**

---

## 15. Why MediVault Wins

1. **Only Zero Cup health project on 0G Mainnet** — not testnet, not mock, not demo mode
2. **Most 0G primitives used** — Storage + Compute + KV + Chain (4/4)
3. **Universal real-world impact** — 8 billion people have health records
4. **True patient ownership** — no backdoor, no company, no hospital
5. **PWA** — installable on any device, offline-ready (no other Zero Cup project has this)
6. **Working product** — 267 Vercel deploys, real users, real data on real chain
7. **Life-or-death feature** — emergency QR card. Literally saves lives.

> **Remove 0G and MediVault ceases to function.**
> **This is not a hackathon demo. This is a real product.**

---

*MediVault · 0G Zero Cup 2026 · Built by Sahil (@sahilvishnaliya) & Sal (@salmanch_)*
*Live: https://medivault-ecru.vercel.app · Verify: https://medivault-ecru.vercel.app/verify*
