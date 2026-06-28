import { describe, it, expect } from 'vitest'
import { ethers } from 'ethers'
import { eciesEncrypt, eciesDecrypt, type EciesEnvelope } from './ecies'

describe('ECIES encryption', () => {
  it('encrypts and decrypts a small payload (round-trip)', async () => {
    const wallet = ethers.Wallet.createRandom()
    const plaintext = new TextEncoder().encode('Hello, MediVault!')
    const envelope = await eciesEncrypt(wallet.publicKey, plaintext)
    const decrypted = await eciesDecrypt(wallet.privateKey, envelope)
    expect(decrypted).toEqual(plaintext)
    expect(new TextDecoder().decode(decrypted)).toBe('Hello, MediVault!')
  })

  it('produces a v2 envelope with the correct algorithm', async () => {
    const wallet = ethers.Wallet.createRandom()
    const envelope = await eciesEncrypt(wallet.publicKey, new TextEncoder().encode('test'))
    expect(envelope.v).toBe(2)
    expect(envelope.alg).toBe('ecdh-secp256k1-aesgcm-hkdf')
    expect(envelope.epk).toMatch(/^0x/)
    expect(envelope.iv).toBeTruthy()
    expect(envelope.ct).toBeTruthy()
  })

  it('fails decryption with the wrong private key', async () => {
    const wallet1 = ethers.Wallet.createRandom()
    const wallet2 = ethers.Wallet.createRandom()
    const envelope = await eciesEncrypt(wallet1.publicKey, new TextEncoder().encode('secret'))
    await expect(eciesDecrypt(wallet2.privateKey, envelope)).rejects.toThrow()
  })

  it('handles empty plaintext', async () => {
    const wallet = ethers.Wallet.createRandom()
    const plaintext = new Uint8Array(0)
    const envelope = await eciesEncrypt(wallet.publicKey, plaintext)
    const decrypted = await eciesDecrypt(wallet.privateKey, envelope)
    expect(decrypted).toEqual(plaintext)
  })

  it('uses different ephemeral keys for each encryption', async () => {
    const wallet = ethers.Wallet.createRandom()
    const pt = new TextEncoder().encode('same')
    const env1 = await eciesEncrypt(wallet.publicKey, pt)
    const env2 = await eciesEncrypt(wallet.publicKey, pt)
    expect(env1.epk).not.toBe(env2.epk)
    expect(env1.ct).not.toBe(env2.ct)
  })

  it('decrypts multiple independent envelopes', async () => {
    const wallet = ethers.Wallet.createRandom()
    const payloads = [
      new TextEncoder().encode('first'),
      new TextEncoder().encode('second'),
      new TextEncoder().encode('third'),
    ]
    const envelopes = await Promise.all(
      payloads.map((p) => eciesEncrypt(wallet.publicKey, p)),
    )
    const decrypted = await Promise.all(
      envelopes.map((env, i) => eciesDecrypt(wallet.privateKey, env)),
    )
    decrypted.forEach((d, i) => {
      expect(new TextDecoder().decode(d)).toBe(new TextDecoder().decode(payloads[i]))
    })
  })

  it('handles binary data (Uint8Array of 0-255)', async () => {
    const wallet = ethers.Wallet.createRandom()
    const data = new Uint8Array(256)
    for (let i = 0; i < 256; i++) data[i] = i
    const envelope = await eciesEncrypt(wallet.publicKey, data)
    const decrypted = await eciesDecrypt(wallet.privateKey, envelope)
    expect(decrypted).toEqual(data)
  })

  it('throws on invalid recipient public key', async () => {
    await expect(
      eciesEncrypt('not-a-valid-public-key', new TextEncoder().encode('test')),
    ).rejects.toThrow()
  })
})
