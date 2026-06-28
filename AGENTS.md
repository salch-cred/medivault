# MediVault — Agent Context

MediVault is a self-sovereign health vault built natively on 0G Network.
Live at: https://medivault-ecru.vercel.app

## Smart Contract (ERC-7857 Agentic iNFT)
- **Contract**: `MediVaultRegistry` — ERC-7857 Intelligent NFT standard (0G Labs)
- **Address**: `0x4E3D3450dc98D3022Ac299D0Ed7AFf80Bd58FA4f`
- **Network**: 0G Mainnet (Chain ID 16661)
- **Explorer**: https://chainscan.0g.ai/address/0x4E3D3450dc98D3022Ac299D0Ed7AFf80Bd58FA4f
- **Standard**: ERC-7857 — https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857
- **Key functions**: `createVault()`, `authorizeUsage()`, `revokeUsage()`, `clone()`, `getAgentData()`

## Architecture
- **Framework**: Next.js 14 App Router (TypeScript)
- **Chain**: 0G Mainnet (chainId: 16661, RPC: https://evmrpc.0g.ai)
- **Storage**: `@0gfoundation/0g-storage-ts-sdk` — AES-256 encrypted uploads
- **AI**: 0G Compute Router (`https://router-api.0g.ai/v1`) — OpenAI-compatible
- **Index**: 0G-KV per wallet address
- **Anchoring**: Calldata-based vault-index anchor on 0G Chain (`src/lib/og/anchor.ts`)

## Key Directories
- `src/lib/og/` — all 0G primitives (storage, crypto, anchor, KV, config)
- `src/lib/ai/` — 0G Compute client + prompt engineering
- `src/app/api/og/` — server routes: health, anchor, share, indexer, KV, verify
- `src/app/vault/` — main vault UI
- `src/app/verify/` — proof + rootHash verification page
- `src/app/scan/` — QR scanner
- `contracts/src/MediVaultRegistry.sol` — ERC-7857 iNFT contract source

## 0G Integration Points
| Feature | 0G Primitive | File |
|---|---|---|
| Encrypted file storage | 0G Storage | `src/lib/og/storage-adapter.ts` |
| Vault index | 0G-KV | `src/lib/og/kv-index-adapter.ts` |
| AI summaries | 0G Compute | `src/lib/ai/client.ts` |
| On-chain anchor | 0G Chain (calldata) | `src/lib/og/anchor.ts` |
| Doctor sharing | 0G Storage (ECIES) | `src/lib/og/storage-adapter.ts` |
| Consent audit | 0G Chain | `src/lib/og/ledger.ts` |
| Vault identity iNFT | ERC-7857 MediVaultRegistry | `contracts/src/MediVaultRegistry.sol` |

## API Endpoints
- `GET /api/og/health` — live 0G chain + storage node status
- `GET /api/og/verify?rootHash=0x…` — verify any record root hash on 0G Network
- `GET /api/og/anchor` — read vault index anchor from chain
- `POST /api/og/index` — read/write encrypted vault index via KV
- `POST /api/og/share` — create ECIES share envelope
- `GET /api/og/pubkey` — fetch recipient public key

## Verify Page
`/verify` — two tabs:
1. **Root Hash** — enter any `0x…` hash, shows 4 live checks against 0G Network
2. **Proof Token** — paste a selective-disclosure proof, verified client-side

## Environment Variables
See `.env.example` for full list. Key vars:
- `AI_API_KEY` — 0G Compute API key (server-only)
- `AI_BASE_URL` — defaults to `https://router-api.0g.ai/v1`
- `AI_MODEL` — model served by 0G Compute
- `NEXT_PUBLIC_ZG_RPC_URL` — `https://evmrpc.0g.ai`
- `NEXT_PUBLIC_ZG_FLOW_CONTRACT` — 0G Flow contract address
- `NEXT_PUBLIC_MEDIVAULT_REGISTRY` — `0x4E3D3450dc98D3022Ac299D0Ed7AFf80Bd58FA4f`

## 0G is Load-Bearing
Remove 0G and MediVault cannot function:
- No 0G Storage → no encrypted file storage (no vault)
- No 0G Compute → no AI summaries (core feature gone)
- No 0G-KV → no cross-device vault index
- No 0G Chain → no tamper-proof audit trail or anchoring
- No ERC-7857 contract → no Agentic iNFT, no on-chain sealed key recovery

## MCP Tools (agent-accessible)
See `/verify` page and `/api/og/health` for live 0G network status.
Any agent can verify a MediVault record root hash via:
```
GET https://medivault-ecru.vercel.app/api/og/verify?rootHash=0x<64-hex-chars>
```

## Contract ABI (key functions)
```solidity
// Mint ERC-7857 iNFT vault
function createVault(bytes32 rootHash, bytes32 dataHash, bytes calldata sealedKey, address oracle) returns (uint256)
function createVault(bytes32 rootHash) returns (uint256) // legacy

// ERC-7857 doctor access
function authorizeUsage(uint256 tokenId, address executor, bytes calldata permissions) external
function revokeUsage(uint256 tokenId, address executor) external
function getExecutorPermissions(uint256 tokenId, address executor) returns (bytes memory)

// ERC-7857 agent data
function getAgentData(uint256 tokenId) returns (AgentData memory)
function isAuthorized(uint256 tokenId, address executor) returns (bool)

// Vault state
function getVaultByAddress(address wallet) returns (uint256, bytes32, uint256, uint256, uint256, bool)
function hasActiveVault(address wallet) returns (bool)
function getRootHash(address wallet) returns (bytes32)
function totalVaults() returns (uint256)
```
