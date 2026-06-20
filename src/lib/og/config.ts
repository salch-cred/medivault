// Central 0G configuration. Public values are safe to expose to the browser;
// the AI key lives only in server-side env (see src/lib/ai/client.ts).
//
// These EXACT values come from the 0G Aristotle Mainnet. Do not guess — override
// only via environment variables.

function getEnvUrl(envVal: string | undefined, defaultUrl: string) {
  // Only accept the env value if it is a real http/https URL.
  // This prevents broken placeholder values (e.g. "................", "", "https://...")
  // from crashing ethers.js with "unsupported protocol" errors.
  if (
    !envVal ||
    envVal.trim() === '' ||
    !envVal.startsWith('http')
  ) {
    return defaultUrl
  }
  return envVal
}

export const ZG = {
  RPC_URL: getEnvUrl(
    process.env.NEXT_PUBLIC_ZG_RPC_URL,
    typeof window !== 'undefined' ? `${window.location.origin}/api/og/rpc` : 'https://evmrpc.0g.ai'
  ),
  INDEXER_RPC: getEnvUrl(
    process.env.NEXT_PUBLIC_ZG_INDEXER_RPC,
    typeof window !== 'undefined' ? `${window.location.origin}/api/og/indexer` : 'https://indexer-storage-turbo.0g.ai'
  ),
  KV_NODE_URL: getEnvUrl(
    process.env.NEXT_PUBLIC_ZG_KV_NODE_URL,
    'https://rpc-storage-turbo.0g.ai'
  ),
  FLOW_CONTRACT:
    process.env.NEXT_PUBLIC_ZG_FLOW_CONTRACT ??
    '0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526',
  CHAIN_ID: Number(process.env.NEXT_PUBLIC_ZG_CHAIN_ID ?? '16661'),
  CHAIN_ID_HEX: '0x' + Number(process.env.NEXT_PUBLIC_ZG_CHAIN_ID ?? '16661').toString(16),
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
