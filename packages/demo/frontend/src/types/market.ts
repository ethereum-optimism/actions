import type { Asset } from '@eth-optimism/actions-sdk'

export interface MarketPosition {
  marketName: string
  marketLogo: string
  networkName: string
  networkLogo: string
  asset: Asset
  assetLogo: string
  apy: number | null
  depositedAmount: string | null
  isLoadingApy: boolean
  isLoadingPosition: boolean
  marketId: {
    address: string
    chainId: number
  }
  provider: 'morpho' | 'aave'
}
