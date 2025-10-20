export interface MarketPosition {
  marketName: string
  marketLogo: string
  networkName: string
  networkLogo: string
  assetSymbol: string
  assetLogo: string
  apy: number | null
  depositedAmount: string | null
  isLoadingApy: boolean
  isLoadingPosition: boolean
  // For transaction routing
  marketId: {
    address: string
    chainId: number
  }
  provider: 'morpho' | 'aave'
}
