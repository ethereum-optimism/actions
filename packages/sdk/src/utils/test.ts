/**
 * Test utilities for the Actions SDK
 */

import type { ChildProcess } from 'child_process'
import { spawn } from 'child_process'
import type { Chain, PublicClient } from 'viem'
import { createPublicClient, createWalletClient, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

/**
 * Standard anvil/foundry test accounts with predictable private keys
 * These are the default accounts created by anvil and are safe to use in tests
 */
export const ANVIL_ACCOUNTS = {
  /** Account #0 - Default primary test account */
  ACCOUNT_0:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const,
  /** Account #1 - Secondary test account, commonly used as funder */
  ACCOUNT_1:
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const,
  /** Account #2 - Third test account */
  ACCOUNT_2:
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const,
} as const

/**
 * Helper function to check if external tests should run
 * External tests make real network requests and are only run when EXTERNAL_TEST=true
 *
 * Usage:
 * ```typescript
 * import { externalTest } from '@/utils/test.js'
 *
 * it.runIf(externalTest())('should make real API request', async () => {
 *   // Test that makes actual network calls
 * })
 * ```
 */
export const externalTest = () => process.env.EXTERNAL_TEST === 'true'

/**
 * Helper function to check if supersim tests should run
 * Supersim tests require supersim to be installed and are only run when SUPERSIM_TEST=true
 *
 * Usage:
 * ```typescript
 * import { supersimTest } from '@/utils/test.js'
 *
 * describe.runIf(supersimTest())('Supersim Integration', () => {
 *   // Tests that require supersim
 * })
 * ```
 */
export const supersimTest = () => process.env.SUPERSIM_TEST === 'true'

/**
 * Configuration for supersim test setup
 */
export interface SupersimConfig {
  /** L1 port (default: 8546) */
  l1Port?: number
  /** L2 starting port (default: 9546) */
  l2StartingPort?: number
  /** Chains to fork (default: ['unichain']) */
  chains?: string[]
  /** Enable verbose logging (default: false) */
  verbose?: boolean
}

/**
 * Start supersim with forked chains
 *
 * Prerequisites:
 * - supersim must be installed (brew install ethereum-optimism/tap/supersim)
 * - foundry must be installed (curl -L https://foundry.paradigm.xyz | bash)
 * @param config - Supersim configuration
 * @returns Promise that resolves with the supersim process when ready
 * @throws Error if supersim is not available
 */
export async function startSupersim(
  config: SupersimConfig = {},
): Promise<ChildProcess> {
  const {
    l1Port = 8546,
    l2StartingPort = 9546,
    chains = ['unichain'],
    verbose = true, // Always verbose for supersim tests
  } = config

  console.log(`Starting supersim with forked chains: ${chains.join(', ')}...`)
  console.log('Verbose mode enabled - supersim logs will be displayed')

  // Start supersim with forked chains on custom ports to avoid conflicts
  const supersimProcess = spawn(
    'supersim',
    [
      'fork',
      '--chains',
      ...chains,
      '--l1.port',
      l1Port.toString(),
      '--l2.starting.port',
      l2StartingPort.toString(),
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // Create new process group so we can kill all children
    },
  )

  // Handle case where supersim command is not found
  supersimProcess.on('error', (error) => {
    if ((error as any).code === 'ENOENT') {
      throw new Error(
        'supersim command not found. Please install supersim:\n' +
          '  macOS/Linux: brew install ethereum-optimism/tap/supersim\n' +
          '  Or download from: https://github.com/ethereum-optimism/supersim/releases',
      )
    }
    throw error
  })

  // Wait for supersim to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Supersim failed to start within 30 seconds'))
    }, 30000)

    // Log supersim output and wait for ready message
    supersimProcess?.stdout?.on('data', (data) => {
      const output = data.toString()
      if (verbose) {
        console.log(`[supersim stdout]: ${output}`)
      }

      if (output.includes('supersim is ready')) {
        clearTimeout(timeout)
        console.log('Supersim is ready!')
        resolve()
      }
    })

    supersimProcess?.stderr?.on('data', (data) => {
      const errorOutput = data.toString()
      if (verbose) {
        console.error(`[supersim stderr]: ${errorOutput}`)
      }
    })

    supersimProcess?.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })

  return supersimProcess
}

/**
 * Stop supersim process and all child processes gracefully
 * @param supersimProcess - The supersim process to stop
 */
export async function stopSupersim(
  supersimProcess: ChildProcess,
): Promise<void> {
  console.log('Stopping supersim...')
  if (supersimProcess && supersimProcess.pid) {
    try {
      // Kill the entire process group (negative PID kills the group)
      process.kill(-supersimProcess.pid, 'SIGTERM')
    } catch {
      // Fallback to killing just the main process
      supersimProcess.kill('SIGTERM')
    }

    // Wait for process to exit with timeout
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if still running after timeout
        try {
          if (supersimProcess.pid && !supersimProcess.killed) {
            process.kill(-supersimProcess.pid, 'SIGKILL')
          }
        } catch {
          if (!supersimProcess.killed) {
            supersimProcess.kill('SIGKILL')
          }
        }
        resolve(undefined)
      }, 10000) // 10 second timeout for graceful shutdown

      supersimProcess?.on('exit', () => {
        clearTimeout(timeout)
        resolve(undefined)
      })
    })
  }
  console.log('Supersim stopped')
}

/**
 * Configuration for wallet funding
 */
export interface FundWalletConfig {
  /** RPC URL for the chain */
  rpcUrl: string
  /** Chain configuration */
  chain: Chain
  /** Target wallet address to fund */
  targetAddress: `0x${string}`
  /** Amount to fund in ETH (default: '10') */
  amount?: string
  /** Funder private key (default: ANVIL_ACCOUNTS.ACCOUNT_1) */
  funderPrivateKey?: `0x${string}`
  /** Whether to also fund with USDC (default: false) */
  fundUsdc?: boolean
  /** Amount of USDC to fund (default: '1000') */
  usdcAmount?: string
}

/**
 * Fund a wallet with ETH and optionally USDC using a funder account
 * @param config - Wallet funding configuration
 * @returns Promise that resolves when funding is complete
 */
export async function fundWallet(config: FundWalletConfig): Promise<void> {
  const {
    rpcUrl,
    chain,
    targetAddress,
    amount = '10',
    funderPrivateKey = ANVIL_ACCOUNTS.ACCOUNT_1, // Use anvil account #1 as default funder
    fundUsdc = false,
    usdcAmount = '1000',
  } = config

  console.log('Funding test wallet...')

  // Create public client for waiting for transaction receipt
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  })

  // Create funder account and wallet client
  const funderAccount = privateKeyToAccount(funderPrivateKey)
  const funderClient = createWalletClient({
    account: funderAccount,
    chain,
    transport: http(rpcUrl),
  }) as any // Type assertion to avoid viem version compatibility issue

  // Send ETH funding transaction
  const fundingTx = await funderClient.sendTransaction({
    to: targetAddress,
    value: parseEther(amount),
  })

  // Wait for transaction confirmation
  await publicClient.waitForTransactionReceipt({ hash: fundingTx })
  console.log(`Test wallet funded with ${amount} ETH at ${targetAddress}`)

  // Fund with USDC if requested using whale impersonation
  if (fundUsdc) {
    try {
      console.log(
        `Attempting to fund ${usdcAmount} USDC using whale impersonation...`,
      )

      // USDC whale address with large balance
      const usdcWhale = '0x5752e57DcfA070e3822d69498185B706c293C792'

      // Impersonate the whale account
      console.log(`Impersonating whale account: ${usdcWhale}`)
      await publicClient.request({
        method: 'anvil_impersonateAccount' as any,
        params: [usdcWhale],
      })

      // USDC contract address on Unichain (from vault config)
      const usdcAddress = '0x078d782b760474a361dda0af3839290b0ef57ad6'

      // Create whale wallet client (for impersonated account, we use the address directly)
      const whaleClient = createWalletClient({
        account: usdcWhale as `0x${string}`,
        chain,
        transport: http(rpcUrl),
      })

      // Transfer USDC from whale to target
      const usdcAmountWei = BigInt(parseFloat(usdcAmount) * 1e6) // USDC has 6 decimals

      console.log(
        `Transferring ${usdcAmount} USDC (${usdcAmountWei} units) from whale to ${targetAddress}`,
      )

      const transferTx = await whaleClient.writeContract({
        address: usdcAddress as `0x${string}`,
        abi: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [targetAddress, usdcAmountWei],
      })

      // Wait for transaction confirmation
      await publicClient.waitForTransactionReceipt({ hash: transferTx })
      console.log(
        `✅ Successfully funded ${usdcAmount} USDC to ${targetAddress}`,
      )

      // Stop impersonating the account
      await publicClient.request({
        method: 'anvil_stopImpersonatingAccount' as any,
        params: [usdcWhale],
      })
    } catch (error) {
      console.log(
        `❌ Failed to fund USDC: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
      console.log(`   This may cause lending tests to fail if USDC is required`)
    }
  }
}

/**
 * Create a test setup for supersim with funded wallet
 * @param config - Combined configuration for supersim and wallet funding
 * @returns Promise that resolves with supersim process, public client, and test account
 */
export async function setupSupersimTest(config: {
  supersim?: SupersimConfig
  wallet: Omit<FundWalletConfig, 'targetAddress'> & {
    testPrivateKey?: `0x${string}`
    address?: `0x${string}` // Optional custom address to fund instead of test account
  }
}): Promise<{
  supersimProcess: ChildProcess
  publicClient: PublicClient
  testAccount: ReturnType<typeof privateKeyToAccount>
}> {
  const testPrivateKey =
    config.wallet.testPrivateKey || ANVIL_ACCOUNTS.ACCOUNT_0 // Use anvil account #0 as default test account

  // Start supersim
  const supersimProcess = await startSupersim(config.supersim)

  // Setup viem clients
  const publicClient = createPublicClient({
    chain: config.wallet.chain,
    transport: http(config.wallet.rpcUrl),
  })

  // Create test account
  const testAccount = privateKeyToAccount(testPrivateKey)

  // Fund the wallet - use custom address if provided, otherwise use test account
  const targetAddress = config.wallet.address || testAccount.address
  await fundWallet({
    ...config.wallet,
    targetAddress,
  })

  return {
    supersimProcess,
    publicClient,
    testAccount,
  }
}
