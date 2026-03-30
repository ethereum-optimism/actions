import type { Address } from 'viem'
import { createWalletClient, erc20Abi, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import type { Asset } from '@/types/asset.js'
import { getAssetAddress } from '@/utils/assets.js'
import { ANVIL_ACCOUNTS } from '@/utils/test.js'

import { WHALES } from '../fixtures/assets.js'
import type { AnvilFork, ForkClient } from './forks.js'

/**
 * Fund a target address with native ETH on an Anvil fork using a default Anvil account.
 */
export async function fundETH(
  fork: AnvilFork,
  target: Address,
  amount: string = '100',
): Promise<void> {
  const funder = privateKeyToAccount(ANVIL_ACCOUNTS.ACCOUNT_1)
  const walletClient = createWalletClient({
    account: funder,
    chain: fork.config.chain,
    transport: http(fork.rpcUrl),
  })

  const hash = await walletClient.sendTransaction({
    to: target,
    value: parseEther(amount),
  })
  await fork.client.waitForTransactionReceipt({ hash })
}

/**
 * Fund a target address with an ERC20 token via whale impersonation on Anvil.
 */
export async function fundERC20(
  fork: AnvilFork,
  target: Address,
  asset: Asset,
  amount: bigint,
): Promise<void> {
  const chainId = fork.config.chainId
  const tokenAddress = getAssetAddress(asset, chainId) as Address

  const chainWhales = WHALES[chainId]
  const whaleAddress = chainWhales?.[asset.metadata.symbol]
  if (!whaleAddress) {
    throw new Error(
      `No whale configured for ${asset.metadata.symbol} on chain ${chainId}. ` +
        `Add one to fixtures/assets.ts WHALES.`,
    )
  }

  await impersonateAndTransfer(fork, whaleAddress, target, tokenAddress, amount)
}

async function impersonateAndTransfer(
  fork: AnvilFork,
  whale: Address,
  target: Address,
  token: Address,
  amount: bigint,
): Promise<void> {
  const rpc = (method: string, params: unknown[]) =>
    fetch(fork.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    })

  await rpc('anvil_impersonateAccount', [whale])

  try {
    const walletClient = createWalletClient({
      account: whale,
      chain: fork.config.chain,
      transport: http(fork.rpcUrl),
    })

    const hash = await walletClient.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [target, amount],
    })

    await fork.client.waitForTransactionReceipt({ hash })
  } finally {
    await rpc('anvil_stopImpersonatingAccount', [whale])
  }
}

/**
 * Read ERC20 balance for a given address on a fork.
 */
export async function getERC20Balance(
  client: ForkClient,
  token: Address,
  account: Address,
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
  })
}

/**
 * Read ERC20 allowance.
 */
export async function getERC20Allowance(
  client: ForkClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  })
}
