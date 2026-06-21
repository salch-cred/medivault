import { ethers } from 'ethers'

export const MASTER_SEED_MESSAGE =
  'MediVault \u2014 unlock my health vault and auto-wallet.\n\n' +
  'Signing this single message generates the AES-256 key that encrypts your records ' +
  'and creates the background wallet that pays 0G gas fees. ' +
  'Only your wallet can reproduce these keys.\n\nVersion: 3'

// In-memory only — NEVER persisted to localStorage.
// The wallet signature is the root secret for every key in the system
// (AES vault key, auto-wallet private key, ECIES sharing keys).
// Persisting it would let anyone with localStorage access (XSS, shared
// device, forensics) steal full vault control.
let cachedMasterSeed: string | null = null

export function clearMasterSeed() {
  cachedMasterSeed = null
}

// Track the storage key so clearMasterSeed doesn't iterate all localStorage entries.
let cachedStorageKey: string | null = null

async function getMasterSeed(signer: ethers.Signer): Promise<string> {
  if (cachedMasterSeed) return cachedMasterSeed

  // Always re-prompt for a fresh signature — the seed is never persisted.
  // This means the user sees a signature prompt each session, but it
  // ensures the root secret never touches storage.
  cachedMasterSeed = await signer.signMessage(MASTER_SEED_MESSAGE)
  return cachedMasterSeed
}

/**
 * Derive a deterministic 32-byte AES-256 key from a wallet signature
 * using HKDF-SHA256 for proper key separation.
 */
export async function deriveVaultKey(
  signer: ethers.Signer,
): Promise<Uint8Array> {
  const seed = await getMasterSeed(signer)
  // Hash signature to get uniform 32-byte input material
  const seedMaterial = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(seed)))
  // HKDF via WebCrypto for proper key derivation
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    seedMaterial as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('MediVault/vault-key/v3') as BufferSource,
      info: new TextEncoder().encode('AES-256 vault encryption') as BufferSource,
    },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
}

/**
 * Recover the public key of the signer from the master seed signature.
 */
export async function recoverUserPublicKey(
  signer: ethers.Signer,
): Promise<string> {
  const seed = await getMasterSeed(signer)
  const messageHash = ethers.hashMessage(MASTER_SEED_MESSAGE)
  return ethers.SigningKey.recoverPublicKey(messageHash, seed)
}

/**
 * Derive a deterministic private key for the Auto-Wallet from a wallet signature.
 * Uses HKDF-SHA256 for proper key separation from the vault key.
 * Returns a 0x-prefixed hex string (32 bytes).
 */
export async function deriveAutoWalletPk(
  signer: ethers.Signer,
): Promise<string> {
  const seed = await getMasterSeed(signer)
  const seedMaterial = ethers.getBytes(ethers.keccak256(ethers.toUtf8Bytes(seed)))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    seedMaterial as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('MediVault/auto-wallet/v3') as BufferSource,
      info: new TextEncoder().encode('auto-wallet signing key') as BufferSource,
    },
    keyMaterial,
    256,
  )
  const bytes = new Uint8Array(bits)
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Stable per-owner stream id for the 0G-KV index. */
export function deriveStreamId(owner: string): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`medivault:index:${owner.toLowerCase()}`),
  )
}

/**
 * Derive a per-record AES-256 key from the wallet master key + a fresh salt.
 *
 * Each uploaded record gets its own 32-byte key via HKDF-SHA256 so that
 * compromising one record's key never reveals any other record. The salt is
 * stored (in the clear — it is not secret) in RecordMeta so the key can be
 * reproduced on download.
 *
 * Records written before this field existed have no salt and continue to use
 * the master key directly (see recordKey() in store.ts).
 */
export async function deriveRecordKey(
  masterKey: Uint8Array,
  salt: Uint8Array,
): Promise<Uint8Array> {
  if (masterKey.byteLength !== 32) throw new Error('master key must be 32 bytes')
  if (salt.byteLength !== 16) throw new Error('salt must be 16 bytes')
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    masterKey as BufferSource,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: new TextEncoder().encode('medivault/record-key/v1') as BufferSource,
    },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
}

/** Generate a fresh 16-byte record salt. */
export function newRecordSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

/**
 * Resolve the AES key to use for a given record. If the record carries a salt,
 * a per-record key is derived; otherwise (legacy records) the master key is
 * returned unchanged so old uploads remain decryptable.
 */
export async function recordKey(
  masterKey: Uint8Array,
  recordKeySalt?: string | null,
): Promise<Uint8Array> {
  if (!recordKeySalt) return masterKey
  const salt = hexToBytes(recordKeySalt)
  return deriveRecordKey(masterKey, salt)
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(h.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.substr(i * 2, 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Hex-encode a salt for storage in RecordMeta. */
export function saltToHex(salt: Uint8Array): string {
  return bytesToHex(salt)
}

/** Encode a string key into bytes for 0G-KV. */
export function kvKeyBytes(key: string): Uint8Array {
  return ethers.toUtf8Bytes(key)
}

/** The reserved KV key that stores the list of record ids for an owner. */
export const KV_INDEX_LIST_KEY = '__medivault_record_ids__'
