import type { Address } from 'viem'
import { erc20Abi, formatUnits } from 'viem'

import {
  MULTICALL3_ADDRESS,
  multicall3GetEthBalanceAbi,
} from '@/constants/multicall.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset, BalanceFetchOptions, TokenBalance } from '@/types/asset.js'

/**
 * Multicall3 contract entry that reads a single asset's balance for a wallet.
 * Native assets resolve to Multicall3's `getEthBalance`; ERC-20s to `balanceOf`.
 */
type BalanceContract =
  | {
      address: Address
      abi: typeof multicall3GetEthBalanceAbi
      functionName: 'getEthBalance'
      args: readonly [Address]
    }
  | {
      address: Address
      abi: typeof erc20Abi
      functionName: 'balanceOf'
      args: readonly [Address]
    }

/**
 * Fetch balances for the given assets across the requested chains (or all
 * supported chains).
 * @description Issues one Multicall3 round trip per chain: the wallet's native
 * balance (via Multicall3's `getEthBalance`) and every configured ERC-20
 * `balanceOf` batch into a single `eth_call`. Total RPCs drop from
 * `chains × (1 + erc20s)` to `chains`. Chains are queried in parallel and the
 * returned array preserves the order of `assets`.
 *
 * Per-call failures are surfaced via `allowFailure: true`: a failed inner call
 * (e.g. a revert from a non-token address) omits that asset on that chain,
 * mirroring how an asset with no configured address is skipped. A transport
 * failure of the whole multicall still rejects, preserving loud failure.
 * @param chainManager - The chain manager
 * @param walletAddress - The wallet address
 * @param assets - Assets to fetch balances for
 * @param options - Optional `chainIds` filter (caller-validated)
 * @returns Promise resolving to one {@link TokenBalance} per asset
 */
export async function fetchBalances(
  chainManager: ChainManager,
  walletAddress: Address,
  assets: Asset[],
  options?: BalanceFetchOptions,
): Promise<TokenBalance[]> {
  const targetChains = [
    ...new Set(options?.chainIds ?? chainManager.getSupportedChains()),
  ]

  const perChainResults = await Promise.all(
    targetChains.map((chainId) =>
      fetchChainBalances(chainManager, walletAddress, assets, chainId),
    ),
  )

  // Transpose the per-chain raw balances back into one TokenBalance per asset.
  return assets.map((asset) => {
    const chains: TokenBalance['chains'] = {}
    let totalBalanceRaw = 0n

    for (const { chainId, balances } of perChainResults) {
      const balanceRaw = balances.get(asset)
      if (balanceRaw === undefined) {
        continue
      }
      chains[chainId] = {
        balanceRaw,
        balance: parseFloat(formatUnits(balanceRaw, asset.metadata.decimals)),
      }
      totalBalanceRaw += balanceRaw
    }

    return {
      asset,
      totalBalance: parseFloat(
        formatUnits(totalBalanceRaw, asset.metadata.decimals),
      ),
      totalBalanceRaw,
      chains,
    }
  })
}

/**
 * Fetch every asset's raw balance on a single chain with one Multicall3 call.
 * @returns The chain id and a map of asset to raw balance for assets that are
 * configured on this chain and whose inner call succeeded.
 */
async function fetchChainBalances(
  chainManager: ChainManager,
  walletAddress: Address,
  assets: Asset[],
  chainId: SupportedChainId,
): Promise<{ chainId: SupportedChainId; balances: Map<Asset, bigint> }> {
  // Pair each asset with its multicall entry, dropping assets not on this chain.
  const entries = assets.flatMap((asset) => {
    const contract = balanceContract(
      chainManager,
      asset,
      chainId,
      walletAddress,
    )
    return contract ? [{ asset, contract }] : []
  })

  const balances = new Map<Asset, bigint>()
  if (entries.length === 0) {
    return { chainId, balances }
  }

  const publicClient = chainManager.getPublicClient(chainId)
  const results = await publicClient.multicall({
    allowFailure: true,
    contracts: entries.map((entry) => entry.contract),
  })

  results.forEach((result, index) => {
    if (result.status === 'success') {
      balances.set(entries[index].asset, result.result)
    }
  })

  return { chainId, balances }
}

/**
 * Build the Multicall3 contract entry that reads `asset`'s balance on `chainId`,
 * or `undefined` when the asset has no configured address on that chain.
 */
function balanceContract(
  chainManager: ChainManager,
  asset: Asset,
  chainId: SupportedChainId,
  walletAddress: Address,
): BalanceContract | undefined {
  const tokenAddress = asset.address[chainId]

  // Native assets exist on every chain, so read them via Multicall3's
  // `getEthBalance` regardless of whether the per-chain address map lists this
  // chain. This matches the previous unconditional native-balance fan-out;
  // gating on the address map would silently drop native balances on supported
  // chains that have no entry in the asset's address map (e.g. celo, superseed).
  if (asset.type === 'native' || tokenAddress === 'native') {
    return {
      address: multicall3Address(chainManager, chainId),
      abi: multicall3GetEthBalanceAbi,
      functionName: 'getEthBalance',
      args: [walletAddress],
    }
  }

  if (!tokenAddress) {
    return undefined
  }

  return {
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [walletAddress],
  }
}

/**
 * Resolve the Multicall3 address for a chain, preferring the chain's own
 * configured deployment and falling back to the canonical address.
 */
function multicall3Address(
  chainManager: ChainManager,
  chainId: SupportedChainId,
): Address {
  return (
    chainManager.getChain(chainId).contracts?.multicall3?.address ??
    MULTICALL3_ADDRESS
  )
}
