'use client'

/**
 * AES-GCM encryption for the localStorage record/summary cache.
 *
 * The key is the wallet-derived vault key (32 bytes, from deriveVaultKey). We
 * store a fresh random IV per write and pack it with the ciphertext, so the
 * same plaintext written twice yields different ciphertext. Nothing lands in
 * localStorage without first being authenticated-encrypted.
 *
 * Format (all base64url): v1.<iv(12)>.<ciphertext>
 */

const PREFIX = 'v1'

function toB64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/')
  let padded = normalized
  while (padded.length % 4) padded += '='
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function importAesKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** Encrypt a UTF-8 string with the given 32-byte key. Returns a packed string. */
export async function encryptString(plain: string, key: Uint8Array): Promise<string> {
  if (key.byteLength !== 32) throw new Error('AES key must be 32 bytes')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await importAesKey(key)
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cryptoKey,
    new TextEncoder().encode(plain) as BufferSource,
  )
  return `${PREFIX}.${toB64Url(iv)}.${toB64Url(new Uint8Array(ct))}`
}

/** Decrypt a packed string. Throws on wrong key / tampering (GCM auth fails). */
export async function decryptString(packed: string, key: Uint8Array): Promise<string> {
  if (key.byteLength !== 32) throw new Error('AES key must be 32 bytes')
  const parts = packed.split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX) throw new Error('Bad cache format')
  const iv = fromB64Url(parts[1])
  const ct = fromB64Url(parts[2])
  const cryptoKey = await importAesKey(key)
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cryptoKey,
    ct as BufferSource,
  )
  return new TextDecoder().decode(pt)
}
