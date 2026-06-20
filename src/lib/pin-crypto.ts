/**
 * Utility functions for PIN-based AES-GCM encryption using Web Crypto API.
 */

// Helper to convert Uint8Array to Base64
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Helper to convert Base64 to Uint8Array
function fromBase64(base64: string): Uint8Array {
  const binary_string = atob(base64)
  const len = binary_string.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i)
  }
  return bytes
}

/**
 * Derives an AES-GCM key from a string PIN and a salt.
 *
 * PBKDF2_ITERATIONS is the current strength for newly-encrypted payloads
 * (600k matches OWASP's 2023+ PBKDF2-SHA256 guidance for low-entropy secrets
 * like a digit PIN that can be brute-forced offline from a QR-embedded blob).
 * The iteration count is stored in v2 payloads so older/lower-count payloads
 * remain decryptable.
 */
const PBKDF2_ITERATIONS = 600_000
const LEGACY_ITERATIONS = 100_000

async function deriveKeyFromPin(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  )
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** A 4-byte big-endian uint32 read from a Uint8Array at the given offset. */
function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000) +
    ((bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3])
  )
}

/** Write a 4-byte big-endian uint32 into a Uint8Array at the given offset. */
function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  // Use >>> 0 to keep it unsigned.
  const v = value >>> 0
  bytes[offset] = (v >>> 24) & 0xff
  bytes[offset + 1] = (v >>> 16) & 0xff
  bytes[offset + 2] = (v >>> 8) & 0xff
  bytes[offset + 3] = v & 0xff
}

/**
 * Encrypts plain text using a PIN.
 *
 * v2 format (URL-safe base64):
 *   magic(1)=0x02 | iterations(4 BE) | salt(16) | iv(12) | ciphertext
 * The iteration count is embedded so decryption knows how many rounds to run,
 * allowing the cost to be raised over time without breaking old payloads.
 */
export async function encryptWithPin(text: string, pin: string): Promise<string> {
  if (typeof window === 'undefined') throw new Error('Web Crypto API only available in browser')

  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const iv = window.crypto.getRandomValues(new Uint8Array(12))

  const key = await deriveKeyFromPin(pin, salt, PBKDF2_ITERATIONS)
  const enc = new TextEncoder()

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any
    },
    key,
    enc.encode(text) as any
  )

  const ciphertext = new Uint8Array(ciphertextBuffer)

  // Header: magic byte (1) + iteration count (4) + salt (16) + iv (12) = 33 bytes
  const headerLen = 1 + 4 + salt.length + iv.length
  const packed = new Uint8Array(headerLen + ciphertext.length)
  packed[0] = 0x02 // magic: v2
  writeUint32(packed, 1, PBKDF2_ITERATIONS)
  packed.set(salt, 5)
  packed.set(iv, 5 + salt.length)
  packed.set(ciphertext, headerLen)

  // Return URL-safe base64
  return toBase64(packed.buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decrypts a packed base64 string using a PIN.
 *
 * Reads both the current v2 format (magic 0x02 | iterations | salt | iv | ct)
 * and the legacy v1 format (salt | iv | ct @ 100k iterations) so older QR
 * codes remain scannable. Throws on wrong PIN or corrupted data.
 */
export async function decryptWithPin(packedBase64Safe: string, pin: string): Promise<string> {
  if (typeof window === 'undefined') throw new Error('Web Crypto API only available in browser')

  // Restore standard base64 characters
  let base64 = packedBase64Safe.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='

  const packed = fromBase64(base64)
  if (packed.length < 28) throw new Error('Invalid payload length')

  let salt: Uint8Array
  let iv: Uint8Array
  let ciphertext: Uint8Array
  let iterations: number

  if (packed[0] === 0x02 && packed.length >= 33) {
    // v2: magic(1) + iterations(4) + salt(16) + iv(12) + ciphertext
    iterations = readUint32(packed, 1)
    salt = packed.slice(5, 21)
    iv = packed.slice(21, 33)
    ciphertext = packed.slice(33)
  } else {
    // v1 (legacy): salt(16) + iv(12) + ciphertext @ 100k iterations
    iterations = LEGACY_ITERATIONS
    salt = packed.slice(0, 16)
    iv = packed.slice(16, 28)
    ciphertext = packed.slice(28)
  }

  const key = await deriveKeyFromPin(pin, salt, iterations)

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as any
      },
      key,
      ciphertext as any
    )
    const dec = new TextDecoder()
    return dec.decode(decryptedBuffer)
  } catch (e) {
    throw new Error('Incorrect PIN or corrupted data')
  }
}
