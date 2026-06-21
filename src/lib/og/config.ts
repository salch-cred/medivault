// Central 0G configuration. Public values are safe to expose to the browser;
// the AI key lives only in server-side env (see src/lib/ai/client.ts).
//
// These values are for 0G Mainnet. Do not change chain/message/derivation
// without a migration flow because user auto-wallet funds may already exist
// on the current derived mainnet address.
//
// KV_NODE_URL: 0G has NO public DNS-named KV node on mainnet -- the KV node is a
// self-hosted service (see https://github.com/0gfoundation/0g-storage-kv). The
// previously hard-coded 'rpc-storage-turbo.0g.ai' does not resolve. Leave this
// empty to disable KV reads (the index falls back to localStorage); set
// NEXT_PUBLIC_OG_KV_NODE_URL to your own https KV endpoint to re-enable reads.

export const ZG = {
  RPC_URL: typeof window !== 'undefined' ? `${window.location.origin}/api/og/rpc` : 'https://evmrpc.0g.ai',
  INDEXER_RPC: typeof window !== 'undefined' ? `${window.location.origin}/api/og/indexer` : 'https://indexer-storage-turbo.0g.ai',
  KV_NODE_URL: process.env.NEXT_PUBLIC_OG_KV_NODE_URL || '',
  FLOW_CONTRACT: '0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526',
  CHAIN_ID: 16661,
  CHAIN_ID_HEX: '0x' + (16661).toString(16),
  CHAIN_NAME: '0G Mainnet',
  CURRENCY: { name: 'OG', symbol: 'OG', decimals: 18 },
  FAUCET_URL: 'https://faucet.0g.ai',
  STORAGE_EXPLORER: 'https://storagescan.0g.ai',
  BLOCK_EXPLORER: 'https://chainscan.0g.ai',
} as const

export function storageScanUrl(rootHash: string): string {
  return `${ZG.STORAGE_EXPLORER}/file/${rootHash}`
}

export function txExplorerUrl(txHash: string): string {
  return `${ZG.BLOCK_EXPLORER}/tx/${txHash}`
}
