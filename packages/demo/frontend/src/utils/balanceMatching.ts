import type { TokenBalance } from '@eth-optimism/actions-sdk/react'
import type { LendMarketId } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { isEthSymbol } from './assetUtils'

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
 * Special handling for ETH markets (uses native ETH balance)
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
    const targetChainId = marketData.marketId.chainId

    // For ETH markets, match by symbol (native token has no address)
    // For ERC20 tokens, match by address and chainId
    if (isEthSymbol(selectedAssetSymbol)) {
      assetToken = allTokenBalances.find((token) => isEthSymbol(token.symbol))
    } else {
      const targetAddress = marketData.assetAddress.toLowerCase()
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

    // Get chain-specific balance if we found the token
    if (assetToken && !chainBalance) {
      chainBalance = assetToken.chainBalances.find(
        (cb) => cb.chainId === targetChainId,
      )
    }
  } else {
    // Fallback to symbol matching (less precise)
    assetToken = allTokenBalances.find(
      (token) => token.symbol === selectedAssetSymbol,
    )
  }

  const isEth = isEthSymbol(selectedAssetSymbol)
  const displayPrecision = isEth ? 4 : 2
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
    return isEth ? '0.0000' : '0.00'
  }
}
