/**
 * Test utilities for the Actions SDK
 */

import type { ChildProcess } from 'child_process'
import { spawn } from 'child_process'
import type { PublicClient } from 'viem'
import { createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Imported separately for internal use by `setupSupersimTest` below.
import type { FundWalletConfig } from '../test/network/index.js'
import { fundWallet } from '../test/network/index.js'

// Re-exported from the consolidated fork harness for back-compat: there is one
// fork-harness entry point (`src/test/network`), surfaced here too so existing
// importers keep working.
export {
  type AnvilFork,
  createForkChainManager,
  fundWallet,
  type FundWalletConfig,
  startAnvilFork,
  stopAnvilFork,
} from '../test/network/index.js'

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
