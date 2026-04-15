import type { Address, Hex, PublicClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { VelodromeChainConfig } from '@/swap/providers/velodrome/config.js'
import type { ResolvedPoolConfig } from '@/swap/providers/velodrome/types.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice } from '@/types/swap/index.js'

import { encodeCLSwap, getCLQuote } from './routers/cl.js'
import { encodeSwap, getQuote } from './routers/v2.js'

/** Internal result from pool-type-specific quoting */
export interface PoolQuoteResult {
  internalQuote: SwapPrice
  providerContext: Record<string, unknown>
}

/**
 * Fetch a price quote by routing to the correct pool type (v2 AMM or CL/Slipstream).
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
 * Encode swap calldata by routing to the correct pool type (v2 AMM or CL/Slipstream).
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
