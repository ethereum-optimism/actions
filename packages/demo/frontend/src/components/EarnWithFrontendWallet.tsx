import { useIsLoggedIn } from '@dynamic-labs/sdk-react-core'
import { LoginWithDynamic } from './LoginWithDynamic'
import { useActions } from '@/hooks/useActions'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { encodeFunctionData, formatUnits } from 'viem'
import {
  getAssetAddress,
  getTokenBySymbol,
  SUPPORTED_TOKENS,
} from '@eth-optimism/actions-sdk/react'
import type {
  EOATransactionReceipt,
  LendMarket,
  LendMarketPosition,
  LendTransactionReceipt,
  SupportedChainId,
  TokenBalance,
  UserOperationTransactionReceipt,
  Wallet,
} from '@eth-optimism/actions-sdk/react'
import { mintableErc20Abi } from '@/abis/mintableErc20Abi'
import { baseSepolia, chainById, unichain } from '@eth-optimism/viem/chains'
import Earn from './Earn'
import { USDCDemoVault } from '@/constants/markets'
import type { WalletProviderConfig } from '@/constants/walletProviders'

export interface EarnWithFrontendWalletProps {
  wallet: Wallet | null
  logout: () => Promise<void>
  selectedProvider: WalletProviderConfig
}

export function EarnWithFrontendWallet({
  wallet,
  selectedProvider,
  logout,
}: EarnWithFrontendWalletProps) {
  const isLoggedIn = useIsLoggedIn()
  const { actions } = useActions()

  const [usdcBalance, setUsdcBalance] = useState<string>('0')
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [walletCreated, setWalletCreated] = useState(false)
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null)
  const [apy, setApy] = useState<number | null>(null)
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const [isLoadingApy, setIsLoadingApy] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  // Market data for transactions
  const [marketData, setMarketData] = useState<{
    marketId: { chainId: SupportedChainId; address: Address }
    assetAddress: Address
  } | null>(null)
  const hasInitiatedMarketFetch = useRef(false)

  // Function to fetch wallet balance
  const fetchBalance = useCallback(async () => {
    if (!wallet) {
      return
    }
    try {
      setIsLoadingBalance(true)
      const tokenBalances = await wallet.getBalance()
      const vaults = await actions.lend.getMarkets()

      const vaultBalances = await Promise.all(
        vaults.map(async (vault) => {
          try {
            const vaultBalance = await wallet.lend!.getPosition({
              marketId: vault.marketId,
            })

            // Only include vaults with non-zero balances
            if (vaultBalance.balance > 0n) {
              // Create a TokenBalance object for the vault
              const formattedBalance = formatUnits(vaultBalance.balance, 6) // Assuming 6 decimals for vault shares

              // Get asset address for the vault's chain
              const assetAddress = getAssetAddress(
                vault.asset,
                vault.marketId.chainId,
              )

              return {
                symbol: `${vault.name}`,
                totalBalance: vaultBalance.balance,
                totalFormattedBalance: formattedBalance,
                chainBalances: [
                  {
                    chainId: vaultBalance.marketId.chainId,
                    balance: vaultBalance.balance,
                    tokenAddress: assetAddress,
                    formattedBalance: formattedBalance,
                  },
                ],
              } as TokenBalance
            }
            return null
          } catch (error) {
            console.error(error)
            return null
          }
        }),
      )

      const validVaultBalances = vaultBalances.filter(
        (balance): balance is NonNullable<typeof balance> => balance !== null,
      )

      const balanceResult = {
        balance: [...tokenBalances, ...validVaultBalances],
      }

      // Find USDC balance (try USDC_DEMO first not USDC)
      const usdcToken = balanceResult.balance.find(
        (token) => token.symbol === 'USDC_DEMO',
      )

      if (usdcToken && usdcToken.totalBalance > 0) {
        // Parse the balance (it's in smallest unit, divide by 1e6 for USDC)
        const balance = parseFloat(`${usdcToken.totalBalance}`) / 1e6
        // Floor to 2 decimals to ensure we never try to send more than we have
        const flooredBalance = Math.floor(balance * 100) / 100
        setUsdcBalance(flooredBalance.toFixed(2))
      } else {
        setUsdcBalance('0.00')
      }
    } catch {
      setUsdcBalance('0.00')
    } finally {
      setIsLoadingBalance(false)
    }
  }, [wallet, actions])
  const handleMintUSDC = useCallback(async () => {
    if (!wallet) return

    try {
      setIsLoadingBalance(true)
      const walletAddress = wallet.address
      const amountInDecimals = BigInt(Math.floor(parseFloat('100') * 1000000))
      const calls = [
        {
          to: getTokenBySymbol('USDC_DEMO')!.address[baseSepolia.id]!,
          data: encodeFunctionData({
            abi: mintableErc20Abi,
            functionName: 'mint',
            args: [walletAddress, amountInDecimals],
          }),
          value: 0n,
        },
      ]

      await wallet.sendBatch(calls, baseSepolia.id)

      // Wait for the transaction to settle
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Refresh balance after minting
      await fetchBalance()
    } catch (error) {
      console.error('Error minting USDC:', error)
      setIsLoadingBalance(false)
    }
  }, [wallet, fetchBalance])

  // Fetch balance when user logs in
  useEffect(() => {
    const initializeWallet = async () => {
      if (isLoggedIn && wallet && !walletCreated) {
        try {
          await fetchBalance()
          setWalletCreated(true)
        } catch (error) {
          console.error('Error fetching balance:', error)
        }
      }
    }

    initializeWallet()
  }, [isLoggedIn, wallet, walletCreated, fetchBalance])

  // Fetch market APY and data on mount
  useEffect(() => {
    const fetchMarketApy = async () => {
      // Skip if already initiated (prevents double-fetch in StrictMode)
      if (hasInitiatedMarketFetch.current) {
        console.log('[getMarkets] Skipping - already initiated')
        return
      }

      hasInitiatedMarketFetch.current = true
      console.log('[getMarkets] Fetching market data...')

      try {
        setIsLoadingApy(true)
        const markets = await actions.lend.getMarkets()
        const formattedMarkets = await Promise.all(
          markets.map((market) => formatMarketResponse(market)),
        )
        const result = { markets: formattedMarkets }

        const market = result.markets.find(
          (market) =>
            market.marketId.address === USDCDemoVault.address &&
            market.marketId.chainId === USDCDemoVault.chainId,
        )

        if (market) {
          setApy(market.apy.total)

          // Store market data for transactions
          const assetAddress = (market.asset.address[market.marketId.chainId] ||
            Object.values(market.asset.address)[0]) as Address

          setMarketData({
            marketId: market.marketId,
            assetAddress,
          })
        }
      } catch {
        // Error fetching market APY
      } finally {
        setIsLoadingApy(false)
        setIsInitialLoad(false)
      }
    }

    fetchMarketApy()
  }, [
    actions,
    hasInitiatedMarketFetch,
    setIsLoadingApy,
    setIsInitialLoad,
    setMarketData,
    setApy,
  ])

  const fetchPosition = useCallback(async () => {
    if (
      !wallet ||
      !marketData?.marketId.chainId ||
      !marketData?.marketId.address
    )
      return

    try {
      setIsLoadingPosition(true)
      const balance = await wallet.lend!.getPosition({
        marketId: {
          chainId: marketData.marketId.chainId as SupportedChainId,
          address: marketData.marketId.address,
        },
      })
      const position = await formatMarketBalanceResponse(balance)
      setDepositedAmount(position.balanceFormatted)
    } catch {
      setDepositedAmount('0.00')
    } finally {
      setIsLoadingPosition(false)
    }
  }, [wallet, marketData])

  // Fetch position when market data is available or user changes
  useEffect(() => {
    if (
      wallet &&
      marketData?.marketId.chainId &&
      marketData?.marketId.address
    ) {
      fetchPosition()
    }
  }, [wallet, marketData?.marketId.chainId, marketData?.marketId.address])

  const executePositon = useCallback(
    async (operation: 'open' | 'close', amount: number) => {
      if (!wallet || !marketData) {
        throw new Error('User or market data not available')
      }
      const marketId = marketData.marketId
      const tokenAddress = marketData.assetAddress

      const asset = SUPPORTED_TOKENS.find(
        (token) =>
          token.address[marketId.chainId as SupportedChainId] === tokenAddress,
      )
      if (!asset) {
        const error = `Asset not found for token address: ${tokenAddress}`
        console.error('[executePosition] ERROR:', error)
        throw new Error(error)
      }

      const positionParams = { amount, asset, marketId }

      const result =
        operation === 'open'
          ? await wallet.lend!.openPosition(positionParams)
          : await wallet.lend!.closePosition(positionParams)

      const transactionHashes = isEOATransactionReceipt(result)
        ? [result.transactionHash]
        : isBatchEOATransactionReceipt(result)
          ? result.map((receipt) => receipt.transactionHash)
          : undefined

      const userOpHash = isUserOperationTransactionReceipt(result)
        ? result.userOpHash
        : undefined

      const blockExplorerUrls = await getBlockExplorerUrls(
        marketId.chainId,
        transactionHashes,
        userOpHash,
      )

      const transaction = {
        transactionHashes,
        userOpHash,
        blockExplorerUrls,
        amount,
        tokenAddress,
        marketId,
      }

      return { transaction }
    },
    [wallet, marketData],
  )

  // Handle transaction (lend or withdraw)
  const handleTransaction = useCallback(
    async (mode: 'lend' | 'withdraw', amount: number) => {
      if (!wallet || !marketData) {
        throw new Error('User or market data not available')
      }

      const result =
        mode === 'lend'
          ? await executePositon('open', amount)
          : await executePositon('close', amount)

      // Get the first transaction hash if available, or use userOpHash for account abstraction
      const txHash =
        result.transaction.transactionHashes?.[0] ||
        result.transaction.userOpHash

      const explorerUrl = result.transaction.blockExplorerUrls?.[0]

      // Refresh position after successful transaction with a small delay to ensure state is updated
      setTimeout(async () => {
        if (wallet && marketData) {
          try {
            await fetchPosition()
          } catch {
            setDepositedAmount('0.00')
          }
        }
      }, 1000)

      // Also refresh wallet balance
      if (wallet) {
        setTimeout(async () => {
          await fetchBalance()
        }, 2000)
      }

      return {
        transactionHash: txHash,
        blockExplorerUrl: explorerUrl,
      }
    },
    [wallet, marketData, fetchBalance],
  )

  if (!isLoggedIn) {
    return <LoginWithDynamic />
  }

  return (
    <Earn
      ready={true}
      selectedProvider={selectedProvider}
      walletAddress={wallet?.address || null}
      logout={logout}
      usdcBalance={usdcBalance}
      isLoadingBalance={isLoadingBalance}
      apy={apy}
      isLoadingApy={isLoadingApy}
      depositedAmount={depositedAmount}
      isLoadingPosition={isLoadingPosition}
      isInitialLoad={isInitialLoad}
      onMintUSDC={handleMintUSDC}
      onTransaction={handleTransaction}
    />
  )
}

async function formatMarketResponse(market: LendMarket) {
  return {
    marketId: market.marketId,
    name: market.name,
    asset: market.asset,
    supply: {
      totalAssets: formatUnits(
        market.supply.totalAssets,
        market.asset.metadata.decimals,
      ),
      totalShares: formatUnits(market.supply.totalShares, 18),
    },
    apy: market.apy,
    metadata: market.metadata,
  }
}

async function formatMarketBalanceResponse(
  balance: LendMarketPosition,
): Promise<{
  balance: string
  balanceFormatted: string
  shares: string
  sharesFormatted: string
}> {
  return {
    balance: balance.balanceFormatted,
    balanceFormatted: balance.balanceFormatted,
    shares: balance.sharesFormatted,
    sharesFormatted: balance.sharesFormatted,
  }
}

function isEOATransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is EOATransactionReceipt {
  return !Array.isArray(receipt) && !('userOpHash' in receipt)
}

function isBatchEOATransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is EOATransactionReceipt[] {
  return Array.isArray(receipt)
}

function isUserOperationTransactionReceipt(
  receipt: LendTransactionReceipt,
): receipt is UserOperationTransactionReceipt {
  return 'userOpHash' in receipt
}

async function getBlockExplorerUrls(
  chainId: SupportedChainId,
  transactionHashes?: string[],
  userOpHash?: string,
): Promise<string[]> {
  const chain = chainById[chainId]
  if (!chain) {
    throw new Error(`Chain not found for chainId: ${chainId}`)
  }

  let url = `${chain.blockExplorers?.default.url}`
  if (chain.id === unichain.id) {
    url = `https://unichain.blockscout.com`
  }
  if (chain.id === baseSepolia.id) {
    url = `https://base-sepolia.blockscout.com`
  }

  if (userOpHash) {
    return [`${url}/op/${userOpHash}`]
  }
  if (!transactionHashes) {
    throw new Error('Transaction hashes not found')
  }
  return transactionHashes.map((hash) => `${url}/tx/${hash}`)
}
