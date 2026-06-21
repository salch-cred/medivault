'use client'

// Self-contained ECIES (Elliptic Curve Integrated Encryption Scheme) used to
// encrypt a small share envelope DIRECTLY to a recipient's wallet public key,
// with NO dependency on 0G storage retrieval.
//
// Why this exists:
//   The original sharing path uploaded the ECIES envelope to 0G storage and the
//   recipient had to locate+download it from 0G. A freshly-uploaded small blob
//   on 0G mainnet frequently is not locatable for minutes, which surfaced to
//   users as "Document is still registering on the 0G network". This module
//   lets us stash an encrypted copy of the SAME payload in the instant KV layer
//   so the recipient decrypts it on-device in ~1s. The KV server only ever sees
//   ciphertext.
//
// Construction:
//   - ECDH over secp256k1 via ethers SigningKey.computeSharedSecret (so we can
//     reuse the exact same wallet key pair the rest of the app already uses).
//   - HKDF-lite: SHA-256(sharedSecret) -> 256-bit AES-GCM key.
//   - AES-256-GCM (Web Crypto) for authenticated encryption.
//   - Optional gzip of the plaintext (CompressionStream) to keep the KV value
//     small. All primitives are platform built-ins; no new dependencies.

import { ethers } from 'ethers'

export type EciesEnvelope = {
  v: 1
  alg: 'ecdh-secp256k1-aesgcm'
  /** Whether the plaintext was gzip-compressed before encryption. */
  gz: boolean
  /** Ephemeral compressed public key (0x hex). */
  epk: string
  /** AES-GCM IV, base64url. */
  iv: string
  /** AES-GCM ciphertext (incl. auth tag), base64url. */
  ct: string
}

function subtle(): SubtleCrypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto is not available in this environment')
  }
  return crypto.subtle
}

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function gzip(data: Uint8Array): Promise<Uint8Array | null> {
  try {
    const CS = (globalThis as { CompressionStream?: new (f: string) => unknown }).CompressionStream
    if (!CS) return null
    const cs = new CS('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(cs)
    const buf = await new Response(stream as unknown as BodyInit).arrayBuffer()
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as { DecompressionStream?: new (f: string) => unknown }).DecompressionStream
  if (!DS) throw new Error('DecompressionStream unavailable')
  const ds = new DS('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds)
  const buf = await new Response(stream as unknown as BodyInit).arrayBuffer()
  return new Uint8Array(buf)
}

async function aesKeyFromShared(sharedHex: string): Promise<CryptoKey> {
  const sharedBytes = ethers.getBytes(sharedHex)
  const digest = await subtle().digest('SHA-256', sharedBytes as unknown as BufferSource)
  return subtle().importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

/** Encrypt `plaintext` so that only the holder of the private key matching
 *  `recipientPubKey` can decrypt it. */
export async function eciesEncrypt(
  recipientPubKey: string,
  plaintext: Uint8Array,
): Promise<EciesEnvelope> {
  const recipient = ethers.SigningKey.computePublicKey(recipientPubKey, true)
  const ephemeralPriv = ethers.Wallet.createRandom().privateKey
  const sk = new ethers.SigningKey(ephemeralPriv)
  const sharedHex = sk.computeSharedSecret(recipient)
  const aesKey = await aesKeyFromShared(sharedHex)

  const gz = await gzip(plaintext)
  const body = gz ?? plaintext

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ctBuf = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    aesKey,
    body as unknown as BufferSource,
  )

  return {
    v: 1,
    alg: 'ecdh-secp256k1-aesgcm',
    gz: gz !== null,
    epk: ethers.SigningKey.computePublicKey(ephemeralPriv, true),
    iv: toB64Url(iv),
    ct: toB64Url(new Uint8Array(ctBuf)),
  }
}

/** Decrypt an envelope produced by `eciesEncrypt` using the recipient's
 *  private key. */
export async function eciesDecrypt(
  privateKey: string,
  env: EciesEnvelope,
): Promise<Uint8Array> {
  const sk = new ethers.SigningKey(privateKey)
  const sharedHex = sk.computeSharedSecret(env.epk)
  const aesKey = await aesKeyFromShared(sharedHex)
  const iv = fromB64Url(env.iv)
  const ct = fromB64Url(env.ct)
  const ptBuf = await subtle().decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    aesKey,
    ct as unknown as BufferSource,
  )
  const body = new Uint8Array(ptBuf)
  return env.gz ? gunzip(body) : body
}
