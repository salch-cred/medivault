'use client'

// Open-source cross-chain swap & bridge UI powered by the LI.FI Widget.
// https://github.com/lifinance/widget (Apache-2.0)
//
// NOTE: This component is client-only and must be loaded with next/dynamic
// ({ ssr: false }) from the parent. The widget bundles its own EVM wallet
// management + React Query provider, so no extra provider wiring is needed.
//
// 0G Mainnet (chainId 16661) is not currently part of LI.FI's supported chain
// list, so it cannot be selected as a bridge destination here. The swap page
// keeps a direct XSwap link for funding the 0G auto-wallet.

import { LiFiWidget, type WidgetConfig } from '@lifi/widget'

const config: WidgetConfig = {
  integrator: 'medivault',
  appearance: 'dark',
  variant: 'compact',
  theme: {
    container: {
      borderRadius: '16px',
    },
  },
}

export default function CrossChainWidget() {
  return <LiFiWidget integrator="medivault" config={config} />
}
