import { ethers } from 'ethers'

/**
 * Fixed, human-readable message the wallet signs to derive its vault key.
 * Signing is deterministic per-wallet, so the same wallet always regenerates
 * the same AES-256 key — there is NO server-side key recovery.
 */
export const VAULT_KEY_MESSAGE =
  'MediVault \u2014 derive my private health-vault encryption key.\n\n' +
  'Signing this message generates the AES-256 key that encrypts your records ' +
  'before they ever leave this device. It costs nothing and sends no transaction. ' +
  'Only your wallet can reproduce this key.\n\nVersion: 1'

export const AUTO_WALLET_MESSAGE =
  'MediVault \u2014 unlock my Auto-Wallet.\n\n' +
  'Signing this message generates a secure, deterministic "Auto-Wallet" tied permanently ' +
  'to your account. This wallet runs in the background to automatically pay 0G gas fees ' +
  'so you never have to deal with transaction popups during uploads.\n\nVersion: 1'

/**
 * Derive a deterministic 32-byte AES-256 key from a wallet signature.
 * key = keccak256( signature(VAULT_KEY_MESSAGE) )
 */
export async function deriveVaultKey(
  signer: ethers.Signer,
): Promise<Uint8Array> {
  const signature = await signer.signMessage(VAULT_KEY_MESSAGE)
  const digest = ethers.keccak256(ethers.toUtf8Bytes(signature))
  return ethers.getBytes(digest) // 32 bytes
}

/**
 * Derive a deterministic private key for the Auto-Wallet from a wallet signature.
 * Returns a 0x-prefixed hex string (32 bytes).
 */
export async function deriveAutoWalletPk(
  signer: ethers.Signer,
): Promise<string> {
  const signature = await signer.signMessage(AUTO_WALLET_MESSAGE)
  const digest = ethers.keccak256(ethers.toUtf8Bytes(signature))
  return digest // 0x... hex string suitable for ethers.Wallet
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
      // Context binding: ties the derived key to MediVault + AES-256 records.
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
