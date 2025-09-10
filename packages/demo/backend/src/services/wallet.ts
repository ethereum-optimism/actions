import type {
  PrivyHostedWalletProvider,
  PrivyProviderGetAllWalletsOptions as GetAllWalletsOptions,
  SmartWallet,
  SmartWalletProvider,
  TokenBalance,
  TransactionData,
} from '@eth-optimism/verbs-sdk'
import { unichain } from '@eth-optimism/viem/chains'
import type { Address, Hex } from 'viem'
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { writeContract } from 'viem/actions'

import { faucetAbi } from '@/abis/faucet.js'
import { env } from '@/config/env.js'

import { getVerbs } from '../config/verbs.js'

export async function createWallet(): Promise<{
  privyAddress: string
  smartWalletAddress: string
}> {
  const verbs = getVerbs()
  const wallet = await verbs.wallet.createWalletWithHostedSigner()
  const smartWalletAddress = await wallet.getAddress()
  return {
    privyAddress: wallet.signer.address,
    smartWalletAddress,
  }
}

export async function getWallet(userId: string): Promise<{
  wallet: SmartWallet
}> {
  const verbs = getVerbs()
  const wallet = await verbs.wallet.getSmartWalletWithHostedSigner({
    walletId: userId,
  })
  return { wallet }
}

export async function getAllWallets(
  options?: GetAllWalletsOptions,
): Promise<Array<{ wallet: SmartWallet; id: string }>> {
  try {
    const verbs = getVerbs()
    const privyWallets = await (
      verbs.wallet.hostedWalletProvider as PrivyHostedWalletProvider
    ).getAllWallets(options)
    return Promise.all(
      privyWallets.map(async (privyWallet) => {
        const walletAddress =
          await verbs.wallet.smartWalletProvider.getWalletAddress({
            owners: [privyWallet.address],
          })
        const account = await privyWallet.account()
        const wallet = (
          verbs.wallet.smartWalletProvider as SmartWalletProvider
        ).getWallet({
          walletAddress,
          signer: account,
          ownerIndex: 0,
        })
        return {
          wallet,
          id: privyWallet.walletId,
        }
      }),
    )
  } catch {
    throw new Error('Failed to get all wallets')
  }
}

export async function getBalance(userId: string): Promise<TokenBalance[]> {
  const { wallet } = await getWallet(userId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  // Get regular token balances
  const tokenBalances = await wallet.getBalance().catch((error) => {
    console.error(error)
    throw error
  })

  // Get vault balances and add them to the response
  const verbs = getVerbs()
  try {
    if (!verbs.lend) {
      throw new Error('Lend provider not configured')
    }
    const vaults = await verbs.lend.getMarkets()

    const vaultBalances = await Promise.all(
      vaults.map(async (vault) => {
        try {
          const walletAddress = await wallet.getAddress()
          const vaultBalance = await verbs.lend.getVaultBalance(
            vault.address,
            walletAddress,
          )

          // Only include vaults with non-zero balances
          if (vaultBalance.balance > 0n) {
            // Create a TokenBalance object for the vault
            const formattedBalance = formatUnits(vaultBalance.balance, 6) // Assuming 6 decimals for vault shares
            return {
              symbol: `${vault.name}`,
              totalBalance: vaultBalance.balance,
              totalFormattedBalance: formattedBalance,
              chainBalances: [
                {
                  chainId: vaultBalance.chainId,
                  balance: vaultBalance.balance,
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

    // Filter out null values and add vault balances to token balances
    const validVaultBalances = vaultBalances.filter(
      (balance): balance is NonNullable<typeof balance> => balance !== null,
    )

    return [...tokenBalances, ...validVaultBalances]
  } catch {
    // Return just token balances if vault balance fetching fails
    return tokenBalances
  }
}

export async function fundWallet(
  userId: string,
  tokenType: 'ETH' | 'USDC',
): Promise<{
  success: boolean
  tokenType: string
  to: string
  privyAddress: string
  amount: string
}> {
  // TODO: do this a better way
  const isLocalSupersim = env.LOCAL_DEV

  const { wallet } = await getWallet(userId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }
  const walletAddress = await wallet.getAddress()

  if (!isLocalSupersim) {
    throw new Error(`Wallet fund is coming soon. For now, manually send USDC or ETH to this wallet:

${walletAddress}

Funding is only available in local development with supersim`)
  }

  const faucetAdminWalletClient = createWalletClient({
    chain: unichain,
    transport: http(env.UNICHAIN_RPC_URL),
    account: privateKeyToAccount(env.FAUCET_ADMIN_PRIVATE_KEY as Hex),
  })

  const publicClient = createPublicClient({
    chain: unichain,
    transport: http(env.UNICHAIN_RPC_URL),
  })

  let dripHash: `0x${string}`
  let privyDripHash: `0x${string}` | undefined
  let amount: bigint
  let formattedAmount: string

  if (tokenType === 'ETH') {
    amount = 100000000000000000n // 0.1 ETH
    formattedAmount = formatEther(amount)
    dripHash = await writeContract(faucetAdminWalletClient, {
      account: faucetAdminWalletClient.account,
      address: env.FAUCET_ADDRESS as Address,
      abi: faucetAbi,
      functionName: 'dripETH',
      args: [walletAddress, amount],
    })
    privyDripHash = await writeContract(faucetAdminWalletClient, {
      account: faucetAdminWalletClient.account,
      address: env.FAUCET_ADDRESS as Address,
      abi: faucetAbi,
      functionName: 'dripETH',
      args: [wallet.signer.address as `0x${string}`, amount],
    })
  } else {
    amount = 1000000000n // 1000 USDC
    formattedAmount = formatUnits(amount, 6)
    const usdcAddress = '0x078D782b760474a361dDA0AF3839290b0EF57AD6'
    dripHash = await writeContract(faucetAdminWalletClient, {
      account: faucetAdminWalletClient.account,
      address: env.FAUCET_ADDRESS as Address,
      abi: faucetAbi,
      functionName: 'dripERC20',
      args: [walletAddress, amount, usdcAddress as Address],
    })
  }

  await publicClient.waitForTransactionReceipt({
    hash: dripHash,
  })
  if (privyDripHash) {
    await publicClient.waitForTransactionReceipt({
      hash: privyDripHash,
    })
  }

  return {
    success: true,
    tokenType,
    to: walletAddress,
    privyAddress: wallet.signer.address,
    amount: formattedAmount,
  }
}

export async function sendTokens(
  walletId: string,
  amount: number,
  recipientAddress: Address,
): Promise<TransactionData> {
  const { wallet } = await getWallet(walletId)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  return wallet.sendTokens(amount, 'usdc', recipientAddress)
}
