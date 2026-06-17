import type { Address, Hex, PublicClient } from 'viem'
import {
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  keccak256,
  zeroAddress,
} from 'viem'

import {
  CURRENCY_AMOUNT_PARAMS,
  EXACT_INPUT_PARAMS,
  EXACT_INPUT_SINGLE_PARAMS,
  EXACT_OUTPUT_PARAMS,
  EXACT_OUTPUT_SINGLE_PARAMS,
  EXTSLOAD_ABI,
  POOL_KEY_ABI_TYPE,
  QUOTER_ABI,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/uniswap/abis.js'
import type { UniswapPathHop } from '@/actions/swap/providers/uniswap/types.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type {
  SwapMarketInfo,
  SwapPrice,
  SwapRoute,
} from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

/**
 * V4 represents native ETH as address(0) in pool keys and settle/take params,
 * unlike V3 which required WETH. Named for clarity at call sites.
 * @see https://github.com/Uniswap/v4-core/blob/main/src/types/Currency.sol
 */
const NATIVE_CURRENCY = zeroAddress

/** V4 pools/hops with no attached hook contract use address(0) for `hooks`. */
const ZERO_HOOKS = zeroAddress

/**
 * Resolve an asset to its V4 currency address (native ETH → address(0)).
 */
function getAssetCurrency(asset: Asset, chainId: SupportedChainId): Address {
  return isNativeAsset(asset)
    ? NATIVE_CURRENCY
    : getAssetAddress(asset, chainId)
}

/**
 * Resolved V4 pool parameters
 */
interface ResolvedPoolParams {
  tokenIn: Address
  tokenOut: Address
  zeroForOne: boolean
  poolKey: {
    currency0: Address
    currency1: Address
    fee: number
    tickSpacing: number
    hooks: Address
  }
}

/**
 * Resolve token addresses, currency sorting, and pool key for a V4 swap
 */
function resolvePoolParams(
  assetIn: Asset,
  assetOut: Asset,
  chainId: SupportedChainId,
  fee: number,
  tickSpacing: number,
): ResolvedPoolParams {
  const tokenIn = getAssetCurrency(assetIn, chainId)
  const tokenOut = getAssetCurrency(assetOut, chainId)

  // V4 requires sorted tokens: currency0 < currency1
  const [currency0, currency1] =
    tokenIn.toLowerCase() < tokenOut.toLowerCase()
      ? [tokenIn, tokenOut]
      : [tokenOut, tokenIn]
  const zeroForOne = tokenIn.toLowerCase() === currency0.toLowerCase()

  const poolKey = {
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks: ZERO_HOOKS,
  }

  return { tokenIn, tokenOut, zeroForOne, poolKey }
}

/**
 * A configured multi-hop route, oriented forward from `assets[0]` to the last asset.
 * `pools[i]` is the V4 pool connecting `assets[i]` and `assets[i + 1]`.
 */
export interface MultiHopParams {
  /** Full forward asset chain: `[origin, ...intermediates, destination]`. */
  assets: Asset[]
  /** Per-segment pool params; length === `assets.length - 1`. */
  pools: Array<{ fee: number; tickSpacing: number }>
}

/** A single V4 PathKey, ready for ABI encoding. */
interface PathKey {
  intermediateCurrency: Address
  fee: number
  tickSpacing: number
  hooks: Address
  hookData: Hex
}

interface ResolvedPathParams {
  currencyIn: Address
  currencyOut: Address
  path: PathKey[]
  /** Asset chain oriented to the swap direction (in → out), for route display. */
  routeAssets: Asset[]
}

/**
 * Build a hooks-free multi-hop route config from per-hop config entries.
 * `origin` is the path's starting asset (`config.assets[0]`); `hops` are the
 * output-first segments from {@link UniswapPathHop}.
 */
export function buildPath(
  origin: Asset,
  hops: UniswapPathHop[],
): MultiHopParams {
  return {
    assets: [origin, ...hops.map((h) => h.asset)],
    pools: hops.map((h) => ({ fee: h.fee, tickSpacing: h.tickSpacing })),
  }
}

/**
 * Resolve a configured forward route into V4 PathKeys oriented for the actual
 * swap direction and amount kind.
 *
 * V4 consumes the path differently per amount kind: exact-input iterates the
 * path forward (each `intermediateCurrency` is a hop's **output**), while
 * exact-output iterates it backward (each `intermediateCurrency` is a hop's
 * **input**). The fee/tickSpacing stay positionally aligned with the pools in
 * both cases.
 * @see https://github.com/Uniswap/v4-periphery/blob/main/src/libraries/PathKey.sol
 */
function resolvePathParams(
  assetIn: Asset,
  assetOut: Asset,
  chainId: SupportedChainId,
  multiHop: MultiHopParams,
  isExactInput: boolean,
): ResolvedPathParams {
  // Orient the configured forward route to the actual swap direction (in → out).
  const inCurrency = getAssetCurrency(assetIn, chainId).toLowerCase()
  const outCurrency = getAssetCurrency(assetOut, chainId).toLowerCase()
  const origin = getAssetCurrency(multiHop.assets[0], chainId).toLowerCase()
  const destination = getAssetCurrency(
    multiHop.assets[multiHop.assets.length - 1],
    chainId,
  ).toLowerCase()

  // The configured path must connect exactly the requested pair. Without this
  // guard a pair-match on a wider config (e.g. an intermediate asset) would
  // silently encode a swap to the wrong currency — a wrong byte here bare-reverts
  // on-chain or delivers the wrong token.
  const forward = inCurrency === origin && outCurrency === destination
  const reverse = inCurrency === destination && outCurrency === origin
  if (!forward && !reverse) {
    throw new Error(
      `multi-hop path endpoints (${origin} → ${destination}) do not match swap pair (${inCurrency} → ${outCurrency})`,
    )
  }

  const assets = forward ? multiHop.assets : [...multiHop.assets].reverse()
  const pools = forward ? multiHop.pools : [...multiHop.pools].reverse()

  // currencies[i] = currency at chain position i; pools[i] connects i and i+1.
  const currencies = assets.map((a) => getAssetCurrency(a, chainId))
  const n = pools.length

  const path: PathKey[] = pools.map((pool, i) => ({
    // exact-in lists the hop's output (C[i+1]); exact-out lists its input (C[i]).
    intermediateCurrency: isExactInput ? currencies[i + 1] : currencies[i],
    fee: pool.fee,
    tickSpacing: pool.tickSpacing,
    hooks: ZERO_HOOKS,
    hookData: '0x',
  }))

  return {
    currencyIn: currencies[0],
    currencyOut: currencies[n],
    path,
    routeAssets: assets,
  }
}

export interface GetQuoteParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw?: bigint
  amountOutRaw?: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  quoterAddress: Address
  poolManagerAddress: Address
  /** Fee tier in pips (e.g. 100 = 0.01%). Required for single-hop swaps. */
  fee?: number
  /** Tick spacing for the pool. Required for single-hop swaps. */
  tickSpacing?: number
  /**
   * Multi-hop route. When set, overrides `fee`/`tickSpacing` single-hop quoting.
   * Note: multi-hop quotes report `priceImpact: 0` in v1 — a single mid-price
   * across multiple pools is not derived. Use per-pool data in `route.pools`.
   */
  multiHop?: MultiHopParams
}

/**
 * Get a swap quote from the Quoter contract.
 * Routes through V4's path-based quoter when `multiHop` is supplied, otherwise
 * quotes a single direct pool.
 */
export async function getQuote(params: GetQuoteParams): Promise<SwapPrice> {
  const { assetIn, assetOut, amountInRaw, multiHop } = params
  const isExactInput = amountInRaw !== undefined

  const { amountIn, amountOut, gasEstimate, priceImpact, route } = multiHop
    ? await quoteMultiHop(params, multiHop, isExactInput)
    : await quoteSingleHop(params, isExactInput)

  return {
    price: calculatePrice(amountIn, amountOut, assetIn, assetOut),
    priceInverse: calculatePrice(amountOut, amountIn, assetOut, assetIn),
    amountIn: parseFloat(formatUnits(amountIn, assetIn.metadata.decimals)),
    amountOut: parseFloat(formatUnits(amountOut, assetOut.metadata.decimals)),
    amountInRaw: amountIn,
    amountOutRaw: amountOut,
    priceImpact,
    route,
    gasEstimate,
  }
}

interface QuoteAmounts {
  amountIn: bigint
  amountOut: bigint
  gasEstimate: bigint
  priceImpact: number
  route: SwapRoute
}

async function quoteSingleHop(
  params: GetQuoteParams,
  isExactInput: boolean,
): Promise<QuoteAmounts> {
  const {
    assetIn,
    assetOut,
    amountInRaw,
    amountOutRaw,
    chainId,
    publicClient,
    quoterAddress,
    poolManagerAddress,
    fee,
    tickSpacing,
  } = params

  if (fee === undefined || tickSpacing === undefined) {
    throw new Error('fee and tickSpacing are required for single-hop quoting')
  }

  const { tokenIn, zeroForOne, poolKey } = resolvePoolParams(
    assetIn,
    assetOut,
    chainId,
    fee,
    tickSpacing,
  )

  // Read pool mid-price and quote in parallel — no extra sequential RPC call
  const [sqrtPriceX96, quoteResult] = await Promise.all([
    getPoolSqrtPrice({ publicClient, poolManagerAddress, poolKey }),
    isExactInput
      ? publicClient.simulateContract({
          address: quoterAddress,
          abi: QUOTER_ABI,
          functionName: 'quoteExactInputSingle',
          args: [
            {
              poolKey,
              zeroForOne,
              exactAmount: amountInRaw!,
              hookData: '0x' as `0x${string}`,
            },
          ],
        })
      : publicClient.simulateContract({
          address: quoterAddress,
          abi: QUOTER_ABI,
          functionName: 'quoteExactOutputSingle',
          args: [
            {
              poolKey,
              zeroForOne,
              exactAmount: amountOutRaw!,
              hookData: '0x' as `0x${string}`,
            },
          ],
        }),
  ])

  const amountIn = isExactInput ? amountInRaw! : quoteResult.result[0]
  const amountOut = isExactInput ? quoteResult.result[0] : amountOutRaw!

  return {
    amountIn,
    amountOut,
    gasEstimate: quoteResult.result[1],
    priceImpact: calculatePriceImpact({
      sqrtPriceX96,
      amountIn,
      amountOut,
      zeroForOne,
    }),
    route: {
      path: [assetIn, assetOut],
      pools: [{ address: tokenIn, fee, version: 'v4' }],
    },
  }
}

async function quoteMultiHop(
  params: GetQuoteParams,
  multiHop: MultiHopParams,
  isExactInput: boolean,
): Promise<QuoteAmounts> {
  const {
    assetIn,
    assetOut,
    amountInRaw,
    amountOutRaw,
    chainId,
    publicClient,
    quoterAddress,
  } = params

  const { currencyIn, currencyOut, path, routeAssets } = resolvePathParams(
    assetIn,
    assetOut,
    chainId,
    multiHop,
    isExactInput,
  )

  // Separate calls per function name keep viem's arg-type inference happy.
  // viem 2.x mis-infers a dynamic `tuple[]` arg as `never[]`; the PathKey shape
  // is validated at encode time via EXACT_INPUT_PARAMS / EXACT_OUTPUT_PARAMS, so
  // we cast only the `path` field while keeping the other args type-checked.
  const pathArg = path as never[]
  const quoteResult = isExactInput
    ? await publicClient.simulateContract({
        address: quoterAddress,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInput',
        args: [
          {
            exactCurrency: currencyIn,
            path: pathArg,
            exactAmount: amountInRaw!,
          },
        ],
      })
    : await publicClient.simulateContract({
        address: quoterAddress,
        abi: QUOTER_ABI,
        functionName: 'quoteExactOutput',
        args: [
          {
            exactCurrency: currencyOut,
            path: pathArg,
            exactAmount: amountOutRaw!,
          },
        ],
      })

  const amountIn = isExactInput ? amountInRaw! : quoteResult.result[0]
  const amountOut = isExactInput ? quoteResult.result[0] : amountOutRaw!

  // routeAssets is already oriented to the swap direction by resolvePathParams.
  const pools: SwapMarketInfo[] = path.map((hop, i) => ({
    // Mirror single-hop's "input currency as address" choice for each hop.
    address: getAssetCurrency(routeAssets[i], chainId),
    fee: hop.fee,
    version: 'v4',
  }))

  return {
    amountIn,
    amountOut,
    gasEstimate: quoteResult.result[1],
    // Mid-price across multiple pools is not derived in v1; report 0 impact.
    priceImpact: 0,
    route: { path: routeAssets, pools },
  }
}

export interface EncodeSwapParams {
  amountInRaw?: bigint
  amountOutRaw?: bigint
  assetIn: Asset
  assetOut: Asset
  slippage: number
  deadline: number
  recipient: Address
  chainId: SupportedChainId
  quote: SwapPrice
  universalRouterAddress: Address
  /** Fee tier in pips (e.g. 100 = 0.01%). Required for single-hop swaps. */
  fee?: number
  /** Tick spacing for the pool. Required for single-hop swaps. */
  tickSpacing?: number
  /** Multi-hop route. When set, encodes a path-based swap instead of single-hop. */
  multiHop?: MultiHopParams
}

// V4 Universal Router command
const V4_SWAP = 0x10

// V4 action types
const SWAP_EXACT_IN_SINGLE = 0x06
const SWAP_EXACT_IN = 0x07
const SWAP_EXACT_OUT_SINGLE = 0x08
const SWAP_EXACT_OUT = 0x09
const SETTLE_ALL = 0x0c
const TAKE_ALL = 0x0f

/** Pack V4 action bytes into a single hex string (e.g. [0x06,0x0c,0x0f] → "0x060c0f"). */
function encodeActions(actions: number[]): Hex {
  return `0x${actions.map((a) => a.toString(16).padStart(2, '0')).join('')}` as Hex
}

/**
 * Encode Universal Router V4 swap calldata
 * @description Builds calldata for executing a V4 swap through Universal Router.
 * Routes through V4's path-based actions when `multiHop` is supplied, otherwise
 * encodes a single direct pool.
 */
export function encodeUniversalRouterSwap(params: EncodeSwapParams): Hex {
  const { amountInRaw, slippage, quote, multiHop, deadline } = params
  const isExactInput = amountInRaw !== undefined

  const minAmountOut =
    (quote.amountOutRaw * BigInt(Math.round((1 - slippage) * 10000))) / 10000n
  const maxAmountIn =
    quote.amountInRaw +
    (quote.amountInRaw * BigInt(Math.round(slippage * 10000))) / 10000n

  const { actions, actionParams } = multiHop
    ? encodeMultiHopActions(params, multiHop, isExactInput, {
        minAmountOut,
        maxAmountIn,
      })
    : encodeSingleHopActions(params, isExactInput, {
        minAmountOut,
        maxAmountIn,
      })

  // Encode V4_SWAP input: abi.encode(bytes actions, bytes[] params)
  const v4SwapInput = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, actionParams],
  )

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [
      `0x${V4_SWAP.toString(16).padStart(2, '0')}` as Hex,
      [v4SwapInput],
      BigInt(deadline),
    ],
  })
}

interface SlippageBounds {
  minAmountOut: bigint
  maxAmountIn: bigint
}

interface EncodedActions {
  actions: Hex
  actionParams: Hex[]
}

function encodeSingleHopActions(
  params: EncodeSwapParams,
  isExactInput: boolean,
  { minAmountOut, maxAmountIn }: SlippageBounds,
): EncodedActions {
  const { amountInRaw, assetIn, assetOut, chainId, quote, fee, tickSpacing } =
    params

  if (fee === undefined || tickSpacing === undefined) {
    throw new Error('fee and tickSpacing are required for single-hop encoding')
  }

  const { tokenIn, tokenOut, zeroForOne, poolKey } = resolvePoolParams(
    assetIn,
    assetOut,
    chainId,
    fee,
    tickSpacing,
  )

  if (isExactInput) {
    return {
      actions: encodeActions([SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]),
      actionParams: [
        encodeAbiParameters(EXACT_INPUT_SINGLE_PARAMS, [
          {
            poolKey,
            zeroForOne,
            amountIn: amountInRaw!,
            amountOutMinimum: minAmountOut,
            hookData: '0x',
          },
        ]),
        encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenIn, amountInRaw!]),
        encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenOut, minAmountOut]),
      ],
    }
  }

  return {
    actions: encodeActions([SWAP_EXACT_OUT_SINGLE, SETTLE_ALL, TAKE_ALL]),
    actionParams: [
      encodeAbiParameters(EXACT_OUTPUT_SINGLE_PARAMS, [
        {
          poolKey,
          zeroForOne,
          amountOut: quote.amountOutRaw,
          amountInMaximum: maxAmountIn,
          hookData: '0x',
        },
      ]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenIn, maxAmountIn]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [
        tokenOut,
        quote.amountOutRaw,
      ]),
    ],
  }
}

function encodeMultiHopActions(
  params: EncodeSwapParams,
  multiHop: MultiHopParams,
  isExactInput: boolean,
  { minAmountOut, maxAmountIn }: SlippageBounds,
): EncodedActions {
  const { amountInRaw, assetIn, assetOut, chainId, quote } = params

  const { currencyIn, currencyOut, path } = resolvePathParams(
    assetIn,
    assetOut,
    chainId,
    multiHop,
    isExactInput,
  )

  if (isExactInput) {
    return {
      actions: encodeActions([SWAP_EXACT_IN, SETTLE_ALL, TAKE_ALL]),
      actionParams: [
        encodeAbiParameters(EXACT_INPUT_PARAMS, [
          {
            currencyIn,
            path,
            amountIn: amountInRaw!,
            amountOutMinimum: minAmountOut,
          },
        ]),
        encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [currencyIn, amountInRaw!]),
        encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [
          currencyOut,
          minAmountOut,
        ]),
      ],
    }
  }

  return {
    actions: encodeActions([SWAP_EXACT_OUT, SETTLE_ALL, TAKE_ALL]),
    actionParams: [
      encodeAbiParameters(EXACT_OUTPUT_PARAMS, [
        {
          currencyOut,
          path,
          amountOut: quote.amountOutRaw,
          amountInMaximum: maxAmountIn,
        },
      ]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [currencyIn, maxAmountIn]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [
        currencyOut,
        quote.amountOutRaw,
      ]),
    ],
  }
}

function calculatePrice(
  amountIn: bigint,
  amountOut: bigint,
  assetIn: Asset,
  assetOut: Asset,
): string {
  const inDecimals = assetIn.metadata.decimals
  const outDecimals = assetOut.metadata.decimals

  const normalizedIn = parseFloat(formatUnits(amountIn, inDecimals))
  const normalizedOut = parseFloat(formatUnits(amountOut, outDecimals))

  return (normalizedOut / normalizedIn).toFixed(6)
}

// ─────────────────────────────────────────────────────────────────────────────
// Price impact via pool mid-price read from PoolManager storage (extsload)
// Formula mirrors Uniswap SDK's computePriceImpact:
//   (quotedOutput - actualOutput) / quotedOutput
// @see https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/utils/computePriceImpact.ts
// ─────────────────────────────────────────────────────────────────────────────

/** @see https://docs.uniswap.org/contracts/v4/reference/core/libraries/StateLibrary */
const POOLS_SLOT = 6n

/**
 * Read sqrtPriceX96 from a V4 pool via PoolManager.extsload (single SLOAD)
 */
export async function getPoolSqrtPrice(params: {
  publicClient: PublicClient
  poolManagerAddress: Address
  poolKey: ResolvedPoolParams['poolKey']
}): Promise<bigint> {
  const { publicClient, poolManagerAddress, poolKey } = params

  const poolId = keccak256(
    encodeAbiParameters(POOL_KEY_ABI_TYPE, [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
    ]),
  )

  // pools[poolId].slot0 — slot0 is at offset 0 from the mapping base
  const slot = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256' }],
      [poolId, POOLS_SLOT],
    ),
  )

  const result = await publicClient.readContract({
    address: poolManagerAddress,
    abi: EXTSLOAD_ABI,
    functionName: 'extsload',
    args: [slot],
  })

  // sqrtPriceX96 is packed in the lower 160 bits of slot0
  return BigInt(result) & ((1n << 160n) - 1n)
}

/**
 * Price impact as a decimal (0.03 = 3%). Returns 0 if unavailable.
 */
export function calculatePriceImpact(params: {
  sqrtPriceX96: bigint
  amountIn: bigint
  amountOut: bigint
  zeroForOne: boolean
}): number {
  const { sqrtPriceX96, amountIn, amountOut, zeroForOne } = params

  if (sqrtPriceX96 === 0n) return 0

  // price(currency0→currency1) = sqrtPriceX96² / 2¹⁹² (raw wei units)
  const Q192 = 1n << 192n
  const sqrtPriceSq = sqrtPriceX96 * sqrtPriceX96

  // What you'd receive at mid-price
  const quotedOutput = zeroForOne
    ? (amountIn * sqrtPriceSq) / Q192
    : (amountIn * Q192) / sqrtPriceSq

  if (quotedOutput === 0n) return 0

  const SCALE = 10n ** 18n
  const impactScaled = ((quotedOutput - amountOut) * SCALE) / quotedOutput
  const impact = Number(impactScaled) / Number(SCALE)

  return Math.max(0, impact)
}
