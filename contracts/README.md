# MediVaultRegistry — Smart Contract

> On-chain vault identity registry for MediVault, deployed on **0G Mainnet** (chain 16661).

## What it does

Every MediVault user gets a **soul-bound NFT** (ERC-721, non-transferable) that serves as their permanent on-chain health vault identity.

| Function | Description |
|---|---|
| `createVault(rootHash)` | Mint your Vault Identity NFT. Stores the Merkle root of all your 0G Storage records. |
| `updateVaultRoot(rootHash, count)` | Update root hash after adding / removing a record. |
| `getVaultByAddress(wallet)` | Look up any wallet's vault: root hash, record count, timestamps. |
| `hasActiveVault(wallet)` | Returns `true` if wallet has an active vault. |
| `getRootHash(wallet)` | Get the current Merkle root for a wallet. |
| `totalVaults()` | Total vaults ever created. |

## Key properties

- **Soul-bound** — the NFT cannot be transferred. Your vault identity stays with your wallet.
- **Non-custodial** — the contract only stores root hashes, never encrypted data.
- **Verifiable** — anyone can call `getVaultByAddress()` to verify a root hash on-chain.
- **0G Mainnet** — deployed on chain ID 16661, verifiable on `chainscan.0g.ai`.

## Deploy

```bash
cd contracts
npm install
cp .env.example .env
# Add DEPLOYER_PRIVATE_KEY to .env

# Deploy to 0G Mainnet
npm run deploy:mainnet

# Deploy to 0G Testnet (for testing)
npm run deploy:testnet
```

## 0G Mainnet config

| Field | Value |
|---|---|
| Chain ID | `16661` |
| RPC URL | `https://evmrpc.0g.ai` |
| Explorer | `https://chainscan.0g.ai` |
| Faucet | `https://faucet.0g.ai` |

## Contract ABI (key functions)

```ts
// Create vault — call once per wallet
function createVault(bytes32 rootHash) external returns (uint256 tokenId)

// Update root hash after each upload
function updateVaultRoot(bytes32 rootHash, uint256 recordCount) external

// Read vault info (public — anyone can verify)
function getVaultByAddress(address wallet) external view returns (
  uint256 tokenId,
  bytes32 rootHash,
  uint256 recordCount,
  uint256 createdAt,
  uint256 updatedAt,
  bool active
)

// Quick checks
function hasActiveVault(address wallet) external view returns (bool)
function getRootHash(address wallet) external view returns (bytes32)
function totalVaults() external view returns (uint256)
```
