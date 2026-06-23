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

import type { SupportedChainId } from '@/constants/supportedChains.js'

/** Per-chain USDC token + a whale holding enough USDC to fund tests. */
const USDC_FUNDING: Partial<
  Record<SupportedChainId, { usdc: Address; whale: Address }>
> = {
  // OP-first: native USDC on Optimism, funded from the Aave V3 aToken
  // reserve (~1.6M USDC at time of writing).
  [optimism.id]: {
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    whale: '0x38d693cE1dF5AaDF7bC62595A37D667aD57922e5',
  },
  // Unichain pair retained for the supersim funding path.
  [unichain.id]: {
    usdc: '0x078d782b760474a361dda0af3839290b0ef57ad6',
    whale: '0x5752e57DcfA070e3822d69498185B706c293C792',
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
  publicClient: ReturnType<typeof createPublicClient>,
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
    amount = '10',
    fundUsdc = false,
    usdcAmount = '1000',
  } = config
  const chainId = chain.id as SupportedChainId

  // Resolve the whale up-front so an unsupported chain fails loudly before any
  // RPC call (and so the failure is deterministically testable offline).
  let funding: { usdc: Address; whale: Address } | undefined
  if (fundUsdc) {
    funding = USDC_FUNDING[chainId]
    if (!funding) {
      throw new Error(
        `fundWallet: no USDC whale configured for chainId ${chainId}; cannot fund USDC`,
      )
    }
  }

  const testClient = createTestClient({
    chain,
    mode: 'anvil',
    transport: http(rpcUrl),
  })
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })

  await testClient.setBalance({
    address: targetAddress,
    value: parseEther(amount),
  })

  if (fundUsdc && funding) {
    const amountUnits = parseUnits(usdcAmount, 6)
    const before = await readUsdcBalance(
      publicClient,
      funding.usdc,
      targetAddress,
    )

    await testClient.impersonateAccount({ address: funding.whale })
    // The whale may be a contract (e.g. an aToken reserve) with USDC but no
    // ETH; give it gas money so the impersonated transfer can be mined.
    await testClient.setBalance({
      address: funding.whale,
      value: parseEther('1'),
    })
    try {
      const whaleClient = createWalletClient({
        account: funding.whale,
        chain,
        transport: http(rpcUrl),
      })
      const hash = await whaleClient.writeContract({
        address: funding.usdc,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [targetAddress, amountUnits],
      })
      // `waitForTransactionReceipt` resolves for reverted txs too; USDC's
      // `transfer` returns a bool that viem does not check, so assert the
      // receipt status directly. A reverted/failed transfer fails loud here.
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error(
          `fundWallet: USDC transfer reverted on chainId ${chainId} (status ${receipt.status})`,
        )
      }
    } finally {
      await testClient.stopImpersonatingAccount({ address: funding.whale })
    }

    const after = await readUsdcBalance(
      publicClient,
      funding.usdc,
      targetAddress,
    )
    assertFundingLanded(before, after, amountUnits)
  }
}
