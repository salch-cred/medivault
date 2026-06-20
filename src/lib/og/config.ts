// Central 0G configuration. Public values are safe to expose to the browser;
// the AI key lives only in server-side env (see src/lib/ai/client.ts).
//
// These EXACT values come from the 0G Galileo testnet. Do not guess — override
// only via environment variables.

export const ZG = {
  RPC_URL:
    process.env.NEXT_PUBLIC_ZG_RPC_URL ?? (typeof window !== 'undefined' ? `${window.location.origin}/api/og/rpc` : 'https://evmrpc-testnet.0g.ai'),
  INDEXER_RPC:
    process.env.NEXT_PUBLIC_ZG_INDEXER_RPC ?? (typeof window !== 'undefined' ? `${window.location.origin}/api/og/indexer` : 'https://indexer-storage-testnet-turbo.0g.ai'),
  KV_NODE_URL:
    process.env.NEXT_PUBLIC_ZG_KV_NODE_URL ?? 'https://rpc-storage-testnet-turbo.0g.ai',
  FLOW_CONTRACT:
    process.env.NEXT_PUBLIC_ZG_FLOW_CONTRACT ??
    '0x22E03a6A89B950F1c82ec5e74F8eCa321a105296',
  CHAIN_ID: Number(process.env.NEXT_PUBLIC_ZG_CHAIN_ID ?? '16602'),
  CHAIN_ID_HEX: '0x' + Number(process.env.NEXT_PUBLIC_ZG_CHAIN_ID ?? '16602').toString(16),
  CHAIN_NAME: '0G Galileo Testnet',
  CURRENCY: { name: 'OG', symbol: 'OG', decimals: 18 },
  FAUCET_URL: 'https://faucet.0g.ai',
  STORAGE_EXPLORER: 'https://storagescan-galileo.0g.ai',
  BLOCK_EXPLORER: 'https://chainscan-galileo.0g.ai',
} as const

export function storageScanUrl(rootHash: string): string {
  return `${ZG.STORAGE_EXPLORER}/file/${rootHash}`
}

export function txExplorerUrl(txHash: string): string {
  return `${ZG.BLOCK_EXPLORER}/tx/${txHash}`
}
