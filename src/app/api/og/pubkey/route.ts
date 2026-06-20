import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import fs from 'fs'
import path from 'path'
import { KvClient } from '@0gfoundation/0g-storage-ts-sdk'
import { ZG } from '@/lib/og/config'
import { deriveStreamId, kvKeyBytes } from '@/lib/og/crypto'
import { ethers } from 'ethers'

// Determine writable directory based on environment (Vercel has a writable /tmp)
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
const WritableDir = isVercel ? '/tmp' : path.join(process.cwd(), 'scratch')
const PUBKEYS_FILE = path.join(WritableDir, 'public_keys.json')

// Global in-memory cache to ensure registry data is preserved across container runs
const globalForKeys = global as unknown as {
  pubkeysMemory: Record<string, string>
}
if (!globalForKeys.pubkeysMemory) {
  globalForKeys.pubkeysMemory = {}
}

function decodeBase64Safe(value: string): Uint8Array | null {
  const v = value.trim()
  if (!v || v.length % 4 !== 0) return null
  try {
    return ethers.decodeBase64(v)
  } catch {
    return null
  }
}

function readKeys(): Record<string, string> {
  try {
    // Merge memory cache with file system cache
    let fileKeys: Record<string, string> = {}
    if (fs.existsSync(PUBKEYS_FILE)) {
      const data = fs.readFileSync(PUBKEYS_FILE, 'utf8')
      fileKeys = JSON.parse(data)
    }
    // Update global cache with file contents and vice versa
    globalForKeys.pubkeysMemory = {
      ...fileKeys,
      ...globalForKeys.pubkeysMemory
    }
    return globalForKeys.pubkeysMemory
  } catch (e) {
    console.error('Error reading pubkeys registry:', e)
    return globalForKeys.pubkeysMemory || {}
  }
}

function writeKeys(data: Record<string, string>) {
  try {
    globalForKeys.pubkeysMemory = data
    // Write to writable dir, wrap in try-catch so it never crashes the handler if it fails
    fs.mkdirSync(path.dirname(PUBKEYS_FILE), { recursive: true })
    fs.writeFileSync(PUBKEYS_FILE, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error writing pubkeys registry:', e)
  }
}

/** 
 * Fast on-chain ECDSA public key recovery.
 * Fetches 10 recent blocks in parallel and checks each tx from the target address.
 * Also scans Ethereum mainnet since all MetaMask/Rabby users have txs there.
 */
async function recoverPublicKeyOnChain(address: string): Promise<string | null> {
  // Try multiple chains in parallel — return first success
  const chains = [
    'https://evmrpc.0g.ai',
    'https://evmrpc-testnet.0g.ai',
    // Ethereum mainnet public RPCs — almost every wallet has history here
    'https://eth.llamarpc.com',
    'https://ethereum.publicnode.com',
    'https://cloudflare-eth.com',
  ]

  const tryChain = async (rpc: string): Promise<string | null> => {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true })
      provider.pollingInterval = 1000

      const txCount = await provider.getTransactionCount(address)
      if (txCount === 0) return null

      const latestBlock = await provider.getBlockNumber()
      // Fetch 20 blocks in parallel instead of sequentially
      const BATCH = 20
      const blockNums = Array.from({ length: BATCH }, (_, i) => latestBlock - i)

      const blocks = await Promise.all(
        blockNums.map(n => provider.getBlock(n, true).catch(() => null))
      )

      for (const block of blocks) {
        if (!block?.prefetchedTransactions) continue
        for (const tx of block.prefetchedTransactions) {
          if (tx.from?.toLowerCase() !== address.toLowerCase()) continue
          if (!tx.signature) continue
          try {
            const digest = ethers.keccak256(ethers.Transaction.from(tx).unsignedSerialized)
            const recovered = ethers.SigningKey.recoverPublicKey(digest, tx.signature)
            if (recovered) return recovered
          } catch {}
        }
      }
      return null
    } catch {
      return null
    }
  }

  // Race all chains simultaneously — fastest one wins
  const results = await Promise.allSettled(chains.map(tryChain))
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) return r.value
  }
  return null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const address = searchParams.get('address')?.toLowerCase()

    if (!address) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 })
    }

    const keys = readKeys()
    let pubKey = keys[address]

    // Persistent database lookup fallback (keyvalue.immanuel.co)
    if (!pubKey) {
      try {
        const getUrl = `https://keyvalue.immanuel.co/api/KeyVal/GetValue/p0vd5ml2/${address}`
        const res = await fetch(getUrl)
        if (res.ok) {
          const val = await res.text()
          const cleaned = val.replace(/"/g, '').trim()
          if (cleaned && cleaned.startsWith('0x')) {
            pubKey = cleaned
            keys[address] = pubKey
            writeKeys(keys)
          }
        }
      } catch (dbErr) {
        console.warn('Persistent DB lookup failed:', dbErr)
      }
    }

    if (!pubKey) {
      // 0G KV Fallback Lookup
      try {
        const kv = new KvClient(ZG.KV_NODE_URL)
        const streamId = deriveStreamId(address)
        const val = await kv.getValue(streamId, kvKeyBytes('__medivault_pubkey__'))
        if (val) {
          let bytes: Uint8Array | null = null
          if (typeof val === 'string') bytes = decodeBase64Safe(val)
          else if (val && typeof (val as any).data === 'string') bytes = decodeBase64Safe((val as any).data)
          else if (val instanceof Uint8Array) bytes = val
          if (bytes) {
            const decoded = new TextDecoder().decode(bytes)
            if (decoded?.startsWith('0x')) {
              pubKey = decoded
              keys[address] = pubKey
              writeKeys(keys)
              // Sync back to persistent DB
              try {
                await fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/p0vd5ml2/${address}/${pubKey}`, { method: 'POST' })
              } catch {}
            }
          }
        }
      } catch (kvErr) {
        console.warn('0G KV lookup failed:', kvErr)
      }
    }

    // Fast parallel on-chain recovery across multiple chains
    if (!pubKey) {
      try {
        const recovered = await recoverPublicKeyOnChain(address)
        if (recovered) {
          pubKey = recovered
          keys[address] = pubKey
          writeKeys(keys)
          // Sync back to persistent DB
          try {
            await fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/p0vd5ml2/${address}/${pubKey}`, { method: 'POST' })
          } catch {}
        }
      } catch (chainErr) {
        console.warn('On-chain recovery failed:', chainErr)
      }
    }

    if (!pubKey) {
      return NextResponse.json({ error: 'Public key not found. Please ask the recipient to open MediVault and connect their wallet once.' }, { status: 404 })
    }

    return NextResponse.json({ publicKey: pubKey })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}



export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { address, publicKey } = body

    if (!address || !publicKey) {
      return NextResponse.json({ error: 'Missing address or publicKey parameter' }, { status: 400 })
    }

    const addrLower = address.toLowerCase()
    const keys = readKeys()
    keys[addrLower] = publicKey
    writeKeys(keys)

    // Save to persistent database (keyvalue.immanuel.co)
    try {
      await fetch(`https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/p0vd5ml2/${addrLower}/${publicKey}`, { method: 'POST' })
    } catch (dbErr) {
      console.warn('Failed to save to persistent DB:', dbErr)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
