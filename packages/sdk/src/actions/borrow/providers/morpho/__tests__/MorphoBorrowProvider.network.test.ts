/**
 * Network fork tests for MorphoBorrowProvider.
 * Forks baseSepolia via anvil and exercises read paths + calldata
 * generation against the demo's deployed Morpho Blue borrow market.
 *
 * Run: pnpm test:network
 * Requires: anvil (foundry) on PATH; network access; the demo deploy
 * already executed against baseSepolia (so deployments.json carries
 * non-null morpho.borrow values). Optionally set BASE_SEPOLIA_RPC;
 * defaults to https://sepolia.base.org.
 *
 * The suite skips itself with a clear console.warn when the deploy hasn't
 * run yet (deployments.json fields are still null).
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { blueAbi } from '@morpho-org/blue-sdk-viem'
import {
  type Address,
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  type Hex,
  http,
  type PublicClient,
} from 'viem'
import { baseSepolia } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MorphoBorrowProvider } from '@/actions/borrow/providers/morpho/MorphoBorrowProvider.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  BorrowMarketConfig,
  MorphoMarketParams,
} from '@/types/borrow/index.js'

const BASE_SEPOLIA_ID = baseSepolia.id as SupportedChainId

interface DeployedBorrowMarket {
  marketId: Hex
  marketParams: MorphoMarketParams
  loanTokenAddress: Address
  collateralTokenAddress: Address
}

function readDeployedBorrowMarket(): DeployedBorrowMarket | null {
  const url = new URL(
    '../../../../../../../demo/contracts/state/deployments.json',
    import.meta.url,
  )
  const json = JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as {
    [chainId: string]: {
      tokens?: { USDC_DEMO?: string; OP_DEMO?: string }
      morpho?: {
        borrow?: {
          marketId?: string | null
          marketParams?: {
            loanToken?: string | null
            collateralToken?: string | null
            oracle?: string | null
            irm?: string | null
            lltv?: string | null
          } | null
        }
      }
    }
  }
  const chain = json[String(BASE_SEPOLIA_ID)]
  if (!chain) return null
  const borrow = chain.morpho?.borrow
  const tokens = chain.tokens
  const params = borrow?.marketParams
  if (
    !borrow?.marketId ||
    !params ||
    !params.loanToken ||
    !params.collateralToken ||
    !params.oracle ||
    !params.irm ||
    !params.lltv ||
    !tokens?.OP_DEMO ||
    !tokens?.USDC_DEMO
  ) {
    return null
  }
  return {
    marketId: borrow.marketId as Hex,
    marketParams: {
      loanToken: params.loanToken as Address,
      collateralToken: params.collateralToken as Address,
      oracle: params.oracle as Address,
      irm: params.irm as Address,
      lltv: BigInt(params.lltv),
    },
    loanTokenAddress: tokens.OP_DEMO as Address,
    collateralTokenAddress: tokens.USDC_DEMO as Address,
  }
}

// ── Anvil fork helpers (mirror VelodromeSwapProvider.network.test.ts) ──

interface AnvilFork {
  port: number
  process: ChildProcess
  rpcUrl: string
}

async function startAnvilFork(
  forkUrl: string,
  port: number,
): Promise<AnvilFork> {
  const proc = spawn(
    'anvil',
    ['--fork-url', forkUrl, '--port', String(port), '--silent'],
    { stdio: 'ignore' },
  )

  const rpcUrl = `http://127.0.0.1:${port}`
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      })
      if (res.ok) return { port, process: proc, rpcUrl }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  proc.kill()
  throw new Error(`Anvil fork on port ${port} did not start in time`)
}

function stopAnvilFork(fork: AnvilFork) {
  fork.process.kill()
}

function createForkChainManager(rpcUrl: string): {
  chainManager: ChainManager
  client: PublicClient
} {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })
  const chainManager = {
    getPublicClient: () => client,
    getSupportedChains: () => [BASE_SEPOLIA_ID],
  } as unknown as ChainManager
  return { chainManager, client: client as PublicClient }
}

function buildMarketConfig(deploy: DeployedBorrowMarket): BorrowMarketConfig {
  // Asset shape mirrors what consumers pass when constructing a config.
  // Decimals match the demo tokens (USDC_DEMO is an 18-decimal mock; OP is 18).
  const collateralAsset = {
    type: 'erc20',
    address: { [BASE_SEPOLIA_ID]: deploy.collateralTokenAddress },
    metadata: { name: 'Demo USDC', symbol: 'dUSDC', decimals: 18 },
  } as never
  const borrowAsset = {
    type: 'erc20',
    address: { [BASE_SEPOLIA_ID]: deploy.loanTokenAddress },
    metadata: { name: 'Demo OP', symbol: 'OP', decimals: 18 },
  } as never
  return {
    kind: 'morpho-blue',
    marketId: deploy.marketId,
    chainId: BASE_SEPOLIA_ID,
    name: 'Demo dUSDC / OP',
    collateralAsset,
    borrowAsset,
    borrowProvider: 'morpho',
    lendProvider: 'morpho',
    marketParams: deploy.marketParams,
  }
}

const deployed = readDeployedBorrowMarket()
const describeOrSkip = deployed ? describe : describe.skip

if (!deployed) {
  process.stderr.write(
    'MorphoBorrowProvider.network.test.ts: skipping - deployments.json has not been populated. Run packages/demo/contracts/script/deploy-demo.sh first.\n',
  )
}

describeOrSkip('MorphoBorrowProvider network fork tests', () => {
  let fork: AnvilFork
  let market: BorrowMarketConfig

  beforeAll(async () => {
    if (!deployed) return
    const rpc = process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org'
    fork = await startAnvilFork(rpc, 18547)
    market = buildMarketConfig(deployed)
  }, 60_000)

  afterAll(() => {
    if (fork) stopAnvilFork(fork)
  })

  it('verifies the deployed marketId matches the deployed marketParams', () => {
    if (!deployed) return
    expect(market.marketId.toLowerCase()).toBe(deployed.marketId.toLowerCase())
    // Constructor would throw BorrowMarketParamsMismatchError if these
    // disagreed; instantiating below is the assertion.
    const { chainManager } = createForkChainManager(fork.rpcUrl)
    expect(
      () =>
        new MorphoBorrowProvider({ marketAllowlist: [market] }, chainManager),
    ).not.toThrow()
  })

  it('getMarket returns coherent values for the deployed market', async () => {
    if (!deployed) return
    const { chainManager } = createForkChainManager(fork.rpcUrl)
    const provider = new MorphoBorrowProvider(
      { marketAllowlist: [market] },
      chainManager,
    )
    const result = await provider.getMarket({
      kind: market.kind,
      marketId: market.marketId,
      chainId: market.chainId,
    })
    expect(result.maxLtv).toBeGreaterThan(0)
    expect(result.maxLtv).toBeLessThan(1)
    expect(result.borrowApy).toBeGreaterThanOrEqual(0)
    expect(result.liquidationBonus).toBeGreaterThan(0)
    expect(result.collateralAsset).toBe(market.collateralAsset)
    expect(result.borrowAsset).toBe(market.borrowAsset)
  })

  it('getPosition returns an empty position for a fresh wallet', async () => {
    if (!deployed) return
    const { chainManager } = createForkChainManager(fork.rpcUrl)
    const provider = new MorphoBorrowProvider(
      { marketAllowlist: [market] },
      chainManager,
    )
    // Anvil's first prefunded account — guaranteed to have no Morpho position
    // on a fresh fork.
    const freshWallet =
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const satisfies Address
    const position = await provider.getPosition({
      marketId: market,
      walletAddress: freshWallet,
    })
    expect(position.collateralAmount).toBe(0n)
    expect(position.borrowAmount).toBe(0n)
    expect(position.healthFactor).toBeNull()
    expect(position.ltv).toBeNull()
  })

  it('openPosition emits a [approve, supplyCollateral, borrow] bundle', async () => {
    if (!deployed) return
    const { chainManager } = createForkChainManager(fork.rpcUrl)
    const provider = new MorphoBorrowProvider(
      { marketAllowlist: [market] },
      chainManager,
    )
    const quote = await provider.openPosition({
      market,
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      borrowAmount: { amount: 1 },
      collateralAmount: { amount: 10 },
    })
    expect(quote.action).toBe('open')
    // Fresh wallet → no allowance → approve prepended; collateral → supply;
    // followed by borrow. 3 txs total.
    expect(quote.execution.transactions).toHaveLength(3)
    expect(quote.execution.approvalsSkipped).toBe(false)
    expect(quote.expiresAt).toBeGreaterThan(quote.quotedAt)

    const [approvalTx, supplyTx, borrowTx] = quote.execution.transactions
    const approvalCall = decodeFunctionData({
      abi: erc20Abi,
      data: approvalTx.data,
    })
    const supplyCall = decodeFunctionData({
      abi: blueAbi,
      data: supplyTx.data,
    })
    const borrowCall = decodeFunctionData({
      abi: blueAbi,
      data: borrowTx.data,
    })

    expect(approvalTx.to).toBe(market.marketParams.collateralToken)
    expect(approvalCall.functionName).toBe('approve')
    expect(supplyCall.functionName).toBe('supplyCollateral')
    expect(borrowCall.functionName).toBe('borrow')
  })
})
