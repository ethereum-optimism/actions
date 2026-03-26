import type { Address, Hex, PublicClient } from 'viem'
import { encodeFunctionData, erc20Abi } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  VelodromeChainConfig,
  VelodromeRouterType,
} from '@/swap/providers/velodrome/config.js'
import type { ResolvedPoolConfig } from '@/swap/providers/velodrome/types.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice } from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import { buildApprovalTxIfNeeded } from '@/utils/approve.js'

import { encodeCLSwap, getCLQuote } from './cl.js'
import { encodeSwap, getQuote } from './v2.js'

/** Internal result from pool-type-specific quoting */
export interface PoolQuoteResult {
  internalQuote: SwapPrice
  providerContext: Record<string, unknown>
}

/**
 * Fetch a price quote for the given pool type.
 * @returns Internal quote and provider context for the SwapQuote
 * @throws If CL pool requested on a chain without CL factory/quoter
 */
export async function fetchPoolQuote(
  poolConfig: ResolvedPoolConfig,
  params: {
    assetIn: Asset
    assetOut: Asset
    amountInRaw: bigint
    chainId: SupportedChainId
    publicClient: PublicClient
    chain: VelodromeChainConfig
  },
): Promise<PoolQuoteResult> {
  const { assetIn, assetOut, amountInRaw, chainId, publicClient, chain } =
    params

  if (poolConfig.type === 'cl') {
    if (!chain.contracts.clPoolFactory || !chain.contracts.clQuoterV2) {
      throw new Error(`CL pools not supported on chain ${chainId}`)
    }
    const internalQuote = await getCLQuote({
      assetIn,
      assetOut,
      amountInRaw,
      chainId,
      publicClient,
      clFactoryAddress: chain.contracts.clPoolFactory,
      clQuoterAddress: chain.contracts.clQuoterV2,
      tickSpacing: poolConfig.tickSpacing,
    })
    return {
      internalQuote,
      providerContext: {
        tickSpacing: poolConfig.tickSpacing,
        clFactoryAddress: chain.contracts.clPoolFactory,
        poolAddress: internalQuote.route.pools[0]?.address,
      },
    }
  }

  const internalQuote = await getQuote({
    assetIn,
    assetOut,
    amountInRaw,
    chainId,
    publicClient,
    routerAddress: chain.contracts.router,
    routerType: chain.metadata.routerType,
    stable: poolConfig.stable,
    factoryAddress: chain.contracts.poolFactory,
  })
  return {
    internalQuote,
    providerContext: {
      stable: poolConfig.stable,
      factoryAddress: chain.contracts.poolFactory,
      routerType: chain.metadata.routerType,
    },
  }
}

/**
 * Encode swap calldata for the given pool type.
 * @returns Encoded calldata as hex string
 */
export function encodePoolSwap(
  poolConfig: ResolvedPoolConfig,
  params: {
    assetIn: Asset
    assetOut: Asset
    amountInRaw: bigint
    amountOutMinRaw: bigint
    recipient: Address
    deadline: number
    chainId: SupportedChainId
    chain: VelodromeChainConfig
  },
): Hex {
  if (poolConfig.type === 'cl') {
    return encodeCLSwap({
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      amountInRaw: params.amountInRaw,
      amountOutMin: params.amountOutMinRaw,
      tickSpacing: poolConfig.tickSpacing,
      recipient: params.recipient,
      deadline: params.deadline,
      chainId: params.chainId,
    })
  }

  return encodeSwap({
    assetIn: params.assetIn,
    assetOut: params.assetOut,
    amountInRaw: params.amountInRaw,
    amountOutMin: params.amountOutMinRaw,
    routerType: params.chain.metadata.routerType,
    stable: poolConfig.stable,
    factoryAddress: params.chain.contracts.poolFactory,
    recipient: params.recipient,
    deadline: params.deadline,
    chainId: params.chainId,
  })
}

/**
 * Build a token approval or transfer transaction for swap input.
 *
 * Universal Router uses a direct ERC20 transfer instead of approve+transferFrom.
 * This works because smart wallet batching (4337) bundles the transfer and swap
 * into a single atomic UserOperation — the router receives tokens before executing
 * the swap in the same transaction. The caller must already hold the tokens.
 *
 * Legacy routers (v2, leaf) use standard approve, approving only the deficit.
 */
export async function buildTokenApproval(
  token: Address,
  router: Address,
  routerType: VelodromeRouterType,
  amount: bigint,
  owner: Address,
  publicClient: PublicClient,
): Promise<TransactionData | undefined> {
  if (routerType === 'universal') {
    return {
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [router, amount],
      }),
      value: 0n,
    }
  }

  return buildApprovalTxIfNeeded({
    publicClient,
    token,
    owner,
    spender: router,
    amount,
  })
}
