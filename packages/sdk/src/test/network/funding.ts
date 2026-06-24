/**
 * Fork wallet funding for network tests.
 *
 * Funds ETH via `anvil_setBalance` and (optionally) USDC via whale
 * impersonation, resolving the USDC token + whale per `chainId`. When no
 * whale entry exists for the chain or the post-transfer balance does not move
 * by the requested amount, funding throws loudly rather than logging and
 * continuing, so a test never proceeds against a zero balance
 * (dead-on-arrival / false-green).
 */
import {
  type Address,
  type Chain,
  createPublicClient,
  createTestClient,
  createWalletClient,
  erc20Abi,
  http,
  parseEther,
  parseUnits,
} from 'viem'
import { optimism, unichain } from 'viem/chains'

interface UsdcFunding {
  usdc: Address
  whale: Address
}

type PublicForkClient = ReturnType<typeof createPublicClient>
type TestForkClient = ReturnType<typeof createTestClient>

interface ForkClients {
  publicClient: PublicForkClient
  testClient: TestForkClient
}

const DEFAULT_ETH_AMOUNT = '10'
const DEFAULT_USDC_AMOUNT = '1000'
const USDC_DECIMALS = 6
const WHALE_GAS_AMOUNT = '1'

const OPTIMISM_USDC = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'
const OPTIMISM_AAVE_V3_USDC_ATOKEN =
  '0x38d693cE1dF5AaDF7bC62595A37D667aD57922e5'
const UNICHAIN_USDC = '0x078d782b760474a361dda0af3839290b0ef57ad6'
const UNICHAIN_USDC_WHALE = '0x5752e57DcfA070e3822d69498185B706c293C792'

/** Per-chain USDC token + a whale holding enough USDC to fund tests. */
const USDC_FUNDING: Readonly<Partial<Record<number, UsdcFunding>>> = {
  [optimism.id]: {
    usdc: OPTIMISM_USDC,
    whale: OPTIMISM_AAVE_V3_USDC_ATOKEN,
  },
  [unichain.id]: {
    usdc: UNICHAIN_USDC,
    whale: UNICHAIN_USDC_WHALE,
  },
}

/**
 * Configuration for wallet funding.
 * @description Describes ETH and optional USDC funding for a forked wallet.
 */
export interface FundWalletConfig {
  /** RPC URL for the fork. */
  rpcUrl: string
  /** Chain configuration; `chain.id` selects the USDC whale entry. */
  chain: Chain
  /** Target wallet address to fund. */
  targetAddress: Address
  /** Amount to fund in ETH (default: '10'). */
  amount?: string
  /** Whether to also fund with USDC (default: false). */
  fundUsdc?: boolean
  /** Amount of USDC to fund (default: '1000'). */
  usdcAmount?: string
}

/**
 * Read a wallet's USDC balance.
 * @description Reads the raw token balance used to verify fork funding.
 * @param publicClient - Client bound to the fork.
 * @param usdc - USDC token address.
 * @param owner - Address whose balance to read.
 * @returns Raw USDC balance (6 decimals).
 */
async function readUsdcBalance(
  publicClient: PublicForkClient,
  usdc: Address,
  owner: Address,
): Promise<bigint> {
  return publicClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  })
}

/**
 * Assert that a funding transfer moved exactly the requested amount.
 * @description Fails loudly when USDC funding does not land exactly.
 * @param before - Target balance before the transfer.
 * @param after - Target balance after the transfer.
 * @param expected - Raw amount the transfer was supposed to move.
 * @throws Error when the balance did not increase by exactly `expected`.
 */
export function assertFundingLanded(
  before: bigint,
  after: bigint,
  expected: bigint,
): void {
  if (after - before !== expected) {
    throw new Error(
      `fundWallet: USDC funding did not land: ` +
        `expected balance to increase by ${expected}, got ${after - before}`,
    )
  }
}

function resolveUsdcFunding(chainId: number): UsdcFunding {
  const funding = USDC_FUNDING[chainId]
  if (!funding) {
    throw new Error(
      `fundWallet: no USDC whale configured for chainId ${chainId}; cannot fund USDC`,
    )
  }
  return funding
}

function createForkClients(rpcUrl: string, chain: Chain): ForkClients {
  const transport = http(rpcUrl)
  return {
    publicClient: createPublicClient({ chain, transport }),
    testClient: createTestClient({ chain, mode: 'anvil', transport }),
  }
}

async function setEthBalance(
  testClient: TestForkClient,
  address: Address,
  amount: string,
): Promise<void> {
  await testClient.setBalance({ address, value: parseEther(amount) })
}

async function transferUsdcFromWhale(params: {
  chain: Chain
  chainId: number
  funding: UsdcFunding
  publicClient: PublicForkClient
  rpcUrl: string
  targetAddress: Address
  amount: bigint
}): Promise<void> {
  const {
    chain,
    chainId,
    funding,
    publicClient,
    rpcUrl,
    targetAddress,
    amount,
  } = params
  const whaleClient = createWalletClient({
    account: funding.whale,
    chain,
    transport: http(rpcUrl),
  })
  const hash = await whaleClient.writeContract({
    address: funding.usdc,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [targetAddress, amount],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error(
      `fundWallet: USDC transfer reverted on chainId ${chainId} (status ${receipt.status})`,
    )
  }
}

async function fundUsdcBalance(params: {
  chain: Chain
  funding: UsdcFunding
  publicClient: PublicForkClient
  rpcUrl: string
  targetAddress: Address
  testClient: TestForkClient
  usdcAmount: string
}): Promise<void> {
  const {
    chain,
    funding,
    publicClient,
    targetAddress,
    testClient,
    usdcAmount,
  } = params
  const amountUnits = parseUnits(usdcAmount, USDC_DECIMALS)
  const before = await readUsdcBalance(
    publicClient,
    funding.usdc,
    targetAddress,
  )

  await testClient.impersonateAccount({ address: funding.whale })
  await setEthBalance(testClient, funding.whale, WHALE_GAS_AMOUNT)
  try {
    await transferUsdcFromWhale({
      ...params,
      chainId: chain.id,
      amount: amountUnits,
    })
  } finally {
    await testClient.stopImpersonatingAccount({ address: funding.whale })
  }

  const after = await readUsdcBalance(publicClient, funding.usdc, targetAddress)
  assertFundingLanded(before, after, amountUnits)
}

/**
 * Fund a wallet with ETH and optionally USDC on an Anvil fork.
 * @description Funds a fork-local wallet and verifies requested balances.
 * @param config - Wallet funding configuration.
 * @returns Promise that resolves when funding is complete and verified.
 * @throws Error when USDC funding is requested for a chain with no whale
 * entry, or when the post-transfer USDC balance does not increase by the
 * requested amount.
 */
export async function fundWallet(config: FundWalletConfig): Promise<void> {
  const {
    rpcUrl,
    chain,
    targetAddress,
    amount = DEFAULT_ETH_AMOUNT,
    fundUsdc: shouldFundUsdc = false,
    usdcAmount = DEFAULT_USDC_AMOUNT,
  } = config
  const funding = shouldFundUsdc ? resolveUsdcFunding(chain.id) : undefined
  const { publicClient, testClient } = createForkClients(rpcUrl, chain)

  await setEthBalance(testClient, targetAddress, amount)
  if (!funding) return

  await fundUsdcBalance({
    chain,
    funding,
    publicClient,
    rpcUrl,
    targetAddress,
    testClient,
    usdcAmount,
  })
}
