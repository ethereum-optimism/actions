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
    console.log('[matchAssetBalance] No data available yet')
    return '0.00'
  }

  let assetToken: (typeof allTokenBalances)[0] | undefined
  let chainBalance: (typeof allTokenBalances)[0]['chainBalances'][0] | undefined

  if (marketData?.assetAddress && marketData?.marketId?.chainId) {
    const targetAddress = marketData.assetAddress.toLowerCase()
    const targetChainId = marketData.marketId.chainId

    console.log(
      '[matchAssetBalance] Matching by address:',
      targetAddress,
      'on chain:',
      targetChainId,
    )

    // Special case: For WETH markets on OP Sepolia, check native ETH balance
    // since the faucet provides native ETH, not WETH tokens
    const isWethMarket = selectedAssetSymbol === 'WETH'
    const isOpSepolia = targetChainId === 11155420

    if (isWethMarket && isOpSepolia) {
      console.log(
        '[matchAssetBalance] WETH market on OP Sepolia - checking native ETH balance',
      )
      // Look for ETH token (native)
      assetToken = allTokenBalances.find((token) => token.symbol === 'ETH')
      if (assetToken) {
        chainBalance = assetToken.chainBalances.find(
          (cb) => cb.chainId === targetChainId,
        )
        console.log(
          '[matchAssetBalance] Found ETH balance:',
          chainBalance?.balance,
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
    console.log(
      '[matchAssetBalance] No marketData, falling back to symbol matching',
    )
    assetToken = allTokenBalances.find(
      (token) => token.symbol === selectedAssetSymbol,
    )
  }

  if (assetToken && chainBalance && BigInt(chainBalance.balance) > 0n) {
    // Use the specific chain balance
    const decimals = selectedAssetSymbol.includes('USDC') ? 6 : 18
    const balance =
      parseFloat(`${chainBalance.balance}`) / Math.pow(10, decimals)
    const flooredBalance = Math.floor(balance * 100) / 100
    console.log(
      '[matchAssetBalance] Found token by address, setting balance to:',
      flooredBalance.toFixed(2),
    )
    return flooredBalance.toFixed(2)
  } else if (assetToken && BigInt(assetToken.totalBalance) > 0n) {
    // Fallback to total balance if no specific chain balance
    const decimals = selectedAssetSymbol.includes('USDC') ? 6 : 18
    const balance =
      parseFloat(`${assetToken.totalBalance}`) / Math.pow(10, decimals)
    const flooredBalance = Math.floor(balance * 100) / 100
    console.log(
      '[matchAssetBalance] Found token by symbol, setting balance to:',
      flooredBalance.toFixed(2),
    )
    return flooredBalance.toFixed(2)
  } else {
    console.log(
      '[matchAssetBalance] Token not found or balance is 0, setting to 0.00',
    )
    return '0.00'
  }
}
