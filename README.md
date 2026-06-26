<div align="center">

[![MediVault Banner](docs/screenshots/thumbnail.png)](https://medivault-ecru.vercel.app)

# 🏥 MediVault

### Your private, AI-powered personal health vault — built on 0G.

*Your records are scattered. The jargon is confusing. You're scared to upload them anywhere.*
*MediVault fixes all three — privately, permanently, on-chain.*

[![Live on 0G Mainnet](https://img.shields.io/badge/0G%20Mainnet-Live-6366f1?style=for-the-badge&logo=ethereum&logoColor=white)](https://medivault-ecru.vercel.app)
[![Demo](https://img.shields.io/badge/YouTube-Watch%20Demo-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://youtu.be/zyibyFRAVTY?si=f5Rr-oHN2UvYzZM9)
[![0G Zero Cup](https://img.shields.io/badge/0G%20Zero%20Cup-2026-10b981?style=for-the-badge)](https://0g.ai/arena/zero-cup)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)](https://medivault-ecru.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**[🌐 Live App](https://medivault-ecru.vercel.app)** &nbsp;·&nbsp; **[▶️ Demo Video](https://youtu.be/zyibyFRAVTY?si=f5Rr-oHN2UvYzZM9)** &nbsp;·&nbsp; **[0G Zero Cup](https://0g.ai/arena/zero-cup)** &nbsp;·&nbsp; **[0G Docs](https://docs.0g.ai)**

<br/>

> “*The only Zero Cup project where your encryption key never leaves your device —
> and the only working health vault built natively on 0G.*”

</div>

---

## 📸 Screenshots

### 🖥️ Desktop

<table>
<tr>
<td align="center" width="50%">

**Landing Page**

![Landing Page Desktop](docs/screenshots/desktop-landing.png.png)

*Hero — "Your health history, cryptographically yours"*

</td>
<td align="center" width="50%">

**Vault Dashboard**

![Vault Dashboard Desktop](docs/screenshots/desktop-vault.png.png)

*All records, encrypted & indexed on 0G-KV*

</td>
</tr>
<tr>
<td align="center" width="50%">

**AI Summary**

![AI Summary Desktop](docs/screenshots/desktop-ai-summary.png.png)

*Plain-language explanation via 0G Compute*

</td>
<td align="center" width="50%">

**Doctor Sharing + QR**

![Doctor Share Desktop](docs/screenshots/desktop-share-qr.png.png)

*ECIES-encrypted share + emergency QR card*

</td>
</tr>
</table>

### 📱 Mobile

<table>
<tr>
<td align="center" width="25%">

**Landing**

![Mobile Landing](docs/screenshots/mobile-landing.png.png)

</td>
<td align="center" width="25%">

**Vault**

![Mobile Vault](docs/screenshots/mobile-vault.png.png)

</td>
<td align="center" width="25%">

**AI Summary**

![Mobile AI](docs/screenshots/mobile-ai-summary.png%20(2).png)

</td>
<td align="center" width="25%">

**QR Scanner**

![Mobile QR](docs/screenshots/mobile-qr-scanner.png.png)

</td>
</tr>
</table>

> 📲 MediVault is a **PWA** — install it from your browser on iOS or Android. No app store. No account. Just your wallet.

---

## 🚨 The Problem

Medical records are the most important documents a person owns — yet they're the worst managed.

| Pain point | Reality today |
|---|---|
| 📂 **Scattered** | Spread across clinic portals, PDFs, emails, and paper printouts |
| 😵 **Confusing** | Written in dense medical jargon most patients can't parse |
| 😰 **Risky to store** | Uploading to Google Drive or a random app means trusting a company forever |
| 🚫 **Unshareable** | No secure, instant way to hand a record to a new doctor |
| 🔓 **Owned by others** | Hospitals and labs hold your data — you just get access when they feel like it |

> *Every year, patients arrive at emergency rooms unable to recall their medications, allergies, or prior diagnoses — because their records are scattered across systems they don't control.*

---

## ✅ The Solution

MediVault is a **self-sovereign health vault**. Connect your MetaMask wallet — that's your identity, your key, your vault.

```
  Upload any document  →  AI explains it in plain language
         →  AES-256 encrypted in your browser
                 →  Stored on 0G Network permanently
                         →  Yours. Forever. On any device.
```

### How it works in 5 steps

| Step | Action | What happens |
|---|---|---|
| 1️⃣ | **Connect wallet** | MetaMask signs a fixed message → MediVault derives a deterministic AES-256 key **in your browser**. The key never leaves your device. |
| 2️⃣ | **Upload a document** | Drop any PDF, image, or lab report. `pdf-parse` + `tesseract.js` OCR handles all formats client-side. |
| 3️⃣ | **AI explains it** | 0G Compute returns a plain-language summary, extracts conditions / medications / allergies / red flags, and flags anything urgent. |
| 4️⃣ | **Encrypt & store** | AES-256 ciphertext uploaded to 0G Storage. Merkle root hash indexed in 0G-KV. Your server **never** sees plaintext. |
| 5️⃣ | **Access anywhere** | Open MediVault on any device, connect wallet → full history appears. No login. No server. No cloud backup needed. |

---

## ✨ Features

### 🔐 Privacy & Encryption

| Feature | Details |
|---|---|
| **Wallet-native identity** | Connect MetaMask → AES-256 key derived in-browser from wallet signature. Zero passwords. Zero email. Zero accounts. |
| **Client-side AES-256 encryption** | Every file is encrypted in your browser before upload. 0G Storage only ever receives ciphertext — the server has zero knowledge of your health data. |
| **ECIES doctor sharing** | Share any record to a doctor's wallet address with Elliptic Curve Integrated Encryption. Only the recipient's private key can open it — zero server relay. |
| **No recovery by design** | Your wallet = your vault. No backdoor, no admin override. This is a feature, not a bug. |
| **Rate-limited APIs** | Hybrid in-process + KV-backed rate limiter on all public endpoints to prevent abuse. |

### 🧠 AI-Powered Understanding

| Feature | Details |
|---|---|
| **Plain-language summaries** | Dense lab panels and discharge summaries decoded into clear, human-readable explanations via 0G Compute — never a centralized cloud. |
| **Smart extraction** | Automatically extracts **conditions**, **medications**, **allergies**, **dosages**, and **red flags** from every uploaded document. |
| **Urgency flagging** | AI highlights anything that needs immediate attention — abnormal lab values, drug interactions, critical findings. |
| **"Explain like I'm 5" toggle** | Switch any summary to the simplest possible explanation. Great for patients without medical backgrounds. |
| **Multi-language support** | AI summaries available in multiple languages — your health data explained in the language you understand. |
| **Vault-wide AI chat** | Ask questions across your entire record history. "What medications have I been prescribed?" — AI cites the exact source document. |

### 📂 Record Management

| Feature | Details |
|---|---|
| **Multi-format support** | PDFs, images (JPG/PNG), scanned prescriptions, lab reports, discharge summaries — all handled with OCR + PDF parsing. |
| **Health timeline** | Chronological view of all your medical events across all uploaded records. See your entire health history at a glance. |
| **Lab trend charts** | Visualize lab values (blood sugar, cholesterol, haemoglobin, etc.) over time with reference range overlays. |
| **Content-address deduplication** | Re-upload the same document and MediVault recognises it by content hash — auto-merges, no duplicates, no wasted 0G storage. |
| **Tamper-proof integrity** | Every record has a Merkle root hash verifiable against 0G at any time. One click proves your record is unaltered. |
| **Vault index on-chain** | Record index anchored to 0G-KV — your entire vault can be rebuilt trustlessly from on-chain state. No server required. |

### 👩‍⚕️ Sharing & Collaboration

| Feature | Details |
|---|---|
| **Emergency QR card** | One-tap QR with blood type, allergies, and critical medications — scannable by any doctor, saveable to your phone lock screen. |
| **Doctor handoff summary** | One-click printable summary of your entire medical history — structured for healthcare providers, ready for any appointment. |
| **Tamper-proof certificates** | Generate a shareable certificate proving a record exists, is unaltered, and is anchored to 0G — verifiable by anyone, no account needed. |
| **Consent ledger** | Every share event is written to an immutable, hash-chained audit trail on 0G — who accessed what, and when. Forever. |
| **Received records inbox** | Doctors and family members can send ECIES-encrypted records directly to your wallet. Delivered to your received tab. |

### 📲 Mobile & Offline

| Feature | Details |
|---|---|
| **PWA — install from browser** | Add MediVault to your home screen on iOS or Android directly from the browser. No app store. Instant install. |
| **Offline access** | Service worker caches the app shell. Previously viewed records accessible from local encrypted cache even without internet. |
| **QR scanner (mobile)** | Scan shared health QR codes directly from the mobile app. Fixed to work with iOS Safari — using `jsqr` for cross-browser compatibility. |
| **Mobile-first design** | Responsive layout designed for one-hand use. Every feature accessible on a 375px screen. |

---

## 🔑 Why 0G — Not IPFS, Not S3, Not Anything Else

Every feature in MediVault depends on a specific 0G primitive. **Remove 0G and the product cannot exist.**

| What MediVault needs | 0G primitive | Without 0G |
|---|---|---|
| Permanent, censorship-resistant encrypted storage | **0G Storage** — AES-256 ciphertext + Merkle root | No vault — nowhere to store ciphertext |
| Decentralised AI inference (no cloud snooping) | **0G Compute** — OpenAI-compatible, TEE-backed | No AI summaries without trusting a centralised API |
| Tamper-proof record index per wallet | **0G-KV** — key-value store keyed by wallet address | No trustless vault rebuild across devices |
| Immutable consent + share audit trail | **0G Chain** — on-chain event log | No verifiable proof of who accessed what |

---

## 🏗️ Architecture

```mermaid
flowchart TD
  U(["👤 User + MetaMask"]) -->|"sign fixed message"| K(["🔑 AES-256 key — browser only"])
  U -->|"upload document"| P(["📄 Parse + OCR"])
  P -->|"pdf-parse / tesseract.js"| AI(["🧠 0G Compute"])
  AI --> EX(["Extraction: conditions, meds, allergies, flags"])
  EX --> ENC(["🔒 Encrypt AES-256 in browser"])
  P --> ENC
  K --> ENC
  ENC -->|"ciphertext only"| S(["0G Storage"])
  S --> IDX(["0G-KV index"])
  IDX -->|"any device, any time"| V(["✅ Vault"])
  S -->|"ECIES re-encrypt to recipient pubkey"| D(["👩‍⚕️ Doctor's wallet"])
  V -->|"share event"| CL(["0G Chain — consent ledger"])
```

### Storage & Index Adapters

All 0G I/O is isolated behind two clean interfaces in `src/lib/og/adapters.ts`:

```ts
// Storage — upload, download, share, verify
interface StorageAdapter {
  uploadEncrypted(file: File, key: CryptoKey): Promise<string>   // returns rootHash
  downloadDecrypted(rootHash: string, key: CryptoKey): Promise<Blob>
  shareToRecipient(rootHash: string, recipientPubKey: string): Promise<void>
  verifyIntegrity(rootHash: string): Promise<boolean>
}

// Index — put, list, get record metadata
interface IndexAdapter {
  put(walletAddress: string, record: RecordMeta): Promise<void>
  list(walletAddress: string): Promise<RecordMeta[]>
  get(walletAddress: string, rootHash: string): Promise<RecordMeta>
}
```

> No mocks. No stubs. Both interfaces have exactly one implementation — the real 0G SDK.

---

## 🛡️ Security Model

```
Your wallet private key
        │
        ▼
  sign(fixedMessage)  ──→  AES-256 key  ──→  encrypts every record
                                │
                          NEVER stored
                          NEVER sent to server
                          NEVER logged
                          NEVER recoverable without your wallet
```

| Property | Guarantee |
|---|---|
| **Zero-knowledge server** | API routes process only ciphertext. Plaintext never touches the backend. |
| **No recovery by design** | Lose your wallet → lose your vault. No admin backdoor. This is the point. |
| **Rate-limited APIs** | Hybrid L1 in-process + L2 KV-backed rate limiter on all public endpoints. |
| **ECIES sharing** | `ethers.SigningKey.computePublicKey` + SDK ECIES header. Only the recipient's private key decrypts. |
| **Merkle root verification** | Every record hash verifiable on-chain. Tampering is cryptographically impossible. |

---

## 🚀 Quick Start

### Prerequisites
- [MetaMask](https://metamask.io) browser extension
- Node.js 18+
- A [0G Compute API key](https://router-api.0g.ai)

### Run locally

```bash
git clone https://github.com/salch-cred/medivault
cd medivault
npm install
cp .env.example .env.local
# fill in your API keys (see Environment Variables below)
npm run dev
# → http://localhost:3000
```

### Add 0G Mainnet to MetaMask

| Field | Value |
|---|---|
| Network name | `0G Mainnet` |
| RPC URL | `https://evmrpc.0g.ai` |
| Chain ID | `16661` |
| Currency symbol | `OG` |
| Block explorer | `https://chainscan.0g.ai` |

Get free gas at **[faucet.0g.ai](https://faucet.0g.ai)** — uploading and indexing are on-chain operations.

---

## ⚙️ Environment Variables

**Server-side** (secret — never exposed to browser):

| Variable | Description |
|---|---|
| `AI_API_KEY` | 0G Compute Router API key |
| `AI_BASE_URL` | 0G Compute base URL (default: `https://router-api.0g.ai/v1`) |
| `AI_MODEL` | Model ID served by 0G Compute |

**Client-side** (`NEXT_PUBLIC_*`):

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_ZG_RPC_URL` | `https://evmrpc.0g.ai` |
| `NEXT_PUBLIC_ZG_INDEXER_RPC` | `https://indexer-storage-turbo.0g.ai` |
| `NEXT_PUBLIC_ZG_CHAIN_ID` | `16661` |
| `NEXT_PUBLIC_ZG_FLOW_CONTRACT` | 0G flow contract address |
| `NEXT_PUBLIC_ZG_KV_NODE_URL` | 0G-KV node URL |
| `NEXT_PUBLIC_APP_URL` | Your deployed URL |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | From [cloud.reown.com](https://cloud.reown.com) |

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR + API routes in one deploy |
| Blockchain | 0G Mainnet (chain 16661) via ethers v6 | Native 0G integration |
| Storage | `@0gfoundation/0g-storage-ts-sdk` | Decentralised ciphertext storage |
| AI inference | 0G Compute Router (OpenAI-compatible) | TEE-backed, no centralised cloud |
| Wallet | MetaMask + Web3Modal / WalletConnect | Universal Web3 wallet support |
| Encryption | AES-256 (v1) + ECIES (v2) via 0G SDK | Industry-standard, browser-native |
| OCR | `tesseract.js` (client-side) | Scan handwritten prescriptions |
| PDF parsing | `pdf-parse` (server-side) | Extract text from lab reports |
| QR scanning | `jsqr` (cross-browser, iOS Safari safe) | No native API dependency |
| UI | Tailwind CSS + shadcn/ui + Framer Motion | Fast, accessible, animated |
| PWA | Service Worker + Web App Manifest | Offline-first, installable |

---

## 🗺️ Roadmap

### ✅ Shipped (Group Stage)
- [x] Wallet-native identity + AES-256 client-side encryption
- [x] 0G Storage upload + 0G-KV index
- [x] 0G Compute AI summaries + smart extraction
- [x] ECIES doctor sharing
- [x] Emergency QR card + QR scanner (mobile fixed)
- [x] Consent ledger on-chain
- [x] PWA — installable, offline-ready
- [x] Health timeline + lab trend charts
- [x] Vault-wide AI chat

### 🔄 Next Rounds
- [ ] Selective-disclosure ZK proofs — prove one fact without revealing the record
- [ ] Wallet-based access control lists — multi-doctor sharing + revocation
- [ ] Background key rotation and re-encryption
- [ ] Richer document types — insurance cards, vaccination records, genomics
- [ ] Provider-side inbox with notifications
- [ ] Native mobile app (React Native) with on-device camera capture
- [ ] 0G DA anchoring for ultra-low-cost bulk record archiving

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

<div align="center">

> ⚠️ MediVault explains and organizes your records. **It is not medical advice.** Always consult a qualified clinician.

**Built with ❤️ by [Sahil](https://x.com/sahilvishnaliya) & [Sal](https://x.com/salmanch_) for the [0G Zero Cup 2026](https://0g.ai/arena/zero-cup)**

[🌐 Live App](https://medivault-ecru.vercel.app) &nbsp;·&nbsp; [▶️ Demo](https://youtu.be/zyibyFRAVTY?si=f5Rr-oHN2UvYzZM9) &nbsp;·&nbsp; [0G Docs](https://docs.0g.ai) &nbsp;·&nbsp; [0G Zero Cup](https://0g.ai/arena/zero-cup)

</div>
