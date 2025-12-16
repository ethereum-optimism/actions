import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type { LendMarketId } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

interface BalanceMatchingParams {
  allTokenBalances: TokenBalance[]
  selectedAssetSymbol: string
  marketData?: {
    assetAddress: Address
    marketId: LendMarketId
  } | null
}

/**
 * Extract the balance for a specific asset from token balances
 * Special handling for WETH on OP Sepolia (uses native ETH balance)
 */
export function matchAssetBalance({
  allTokenBalances,
  selectedAssetSymbol,
  marketData,
}: BalanceMatchingParams): string {
  if (!allTokenBalances || !selectedAssetSymbol) {
    return '0.00'
  }

  let assetToken: (typeof allTokenBalances)[0] | undefined
  let chainBalance: (typeof allTokenBalances)[0]['chainBalances'][0] | undefined

  if (marketData?.assetAddress && marketData?.marketId?.chainId) {
    const targetAddress = marketData.assetAddress.toLowerCase()
    const targetChainId = marketData.marketId.chainId

    // Special case: For WETH markets on OP Sepolia, check native ETH balance
    // since the faucet provides native ETH, not WETH tokens
    const isWethMarket = selectedAssetSymbol === 'WETH'
    const isOpSepolia = targetChainId === 11155420

    if (isWethMarket && isOpSepolia) {
      // Look for ETH token (native)
      assetToken = allTokenBalances.find((token) => token.symbol === 'ETH')
      if (assetToken) {
        chainBalance = assetToken.chainBalances.find(
          (cb) => cb.chainId === targetChainId,
        )
      }
    } else {
      // Normal case: Find the token that has a chainBalance matching both address and chainId
      for (const token of allTokenBalances) {
        const matchingChainBalance = token.chainBalances.find(
          (cb) =>
            cb.tokenAddress.toLowerCase() === targetAddress &&
            cb.chainId === targetChainId,
        )
        if (matchingChainBalance) {
          assetToken = token
          chainBalance = matchingChainBalance
          break
        }
      }
    }
  } else {
    // Fallback to symbol matching (less precise)
    assetToken = allTokenBalances.find(
      (token) => token.symbol === selectedAssetSymbol,
    )
  }

  // WETH uses 4 decimal places (0.0001), USDC uses 2 decimal places (0.01)
  const isWeth =
    selectedAssetSymbol === 'WETH' || selectedAssetSymbol.includes('ETH')
  const displayPrecision = isWeth ? 4 : 2
  const precisionMultiplier = Math.pow(10, displayPrecision)

  if (assetToken && chainBalance && BigInt(chainBalance.balance) > 0n) {
    // Use the specific chain balance
    const decimals = selectedAssetSymbol.includes('USDC') ? 6 : 18
    const balance =
      parseFloat(`${chainBalance.balance}`) / Math.pow(10, decimals)
    const flooredBalance =
      Math.floor(balance * precisionMultiplier) / precisionMultiplier
    return flooredBalance.toFixed(displayPrecision)
  } else if (assetToken && BigInt(assetToken.totalBalance) > 0n) {
    // Fallback to total balance if no specific chain balance
    const decimals = selectedAssetSymbol.includes('USDC') ? 6 : 18
    const balance =
      parseFloat(`${assetToken.totalBalance}`) / Math.pow(10, decimals)
    const flooredBalance =
      Math.floor(balance * precisionMultiplier) / precisionMultiplier
    return flooredBalance.toFixed(displayPrecision)
  } else {
    return isWeth ? '0.0000' : '0.00'
  }
}
