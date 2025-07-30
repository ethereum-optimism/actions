import { erc20Abi } from 'viem'
import { unichain } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setupSupersimTest, stopSupersim, supersimTest } from '../../../utils/test.js'
import { LendProviderMorpho } from './index.js'
import { SUPPORTED_VAULTS } from './vaults.js'

// Use the first supported vault (Gauntlet USDC)
const TEST_VAULT = SUPPORTED_VAULTS[0]
const USDC_ADDRESS = TEST_VAULT.asset.address
const TEST_VAULT_ADDRESS = TEST_VAULT.address

describe.runIf(supersimTest())('Morpho Lend', () => {
  let supersimProcess: any
  let publicClient: any
  let testAccount: any
  let morphoProvider: LendProviderMorpho

  beforeAll(async () => {
    // Set up supersim with funded wallet using helper
    const setup = await setupSupersimTest({
      supersim: {
        chains: ['unichain'],
        l1Port: 8546,
        l2StartingPort: 9546,
      },
      wallet: {
        rpcUrl: 'http://127.0.0.1:9546',
        chain: unichain,
        amount: '10',
      },
    })

    supersimProcess = setup.supersimProcess
    publicClient = setup.publicClient
    testAccount = setup.testAccount

    // Initialize Morpho provider
    morphoProvider = new LendProviderMorpho({ type: 'morpho' }, publicClient)
  }, 30000)

  afterAll(async () => {
    await stopSupersim(supersimProcess)
  })

  it('should connect to forked Unichain', async () => {
    // Check that we can connect and get the chain ID
    const chainId = await publicClient.getChainId()
    expect(chainId).toBe(130) // Unichain chain ID

    // Check that our test wallet has ETH
    const balance = await publicClient.getBalance({
      address: testAccount.address,
    })
    expect(balance).toBeGreaterThan(0n)
    console.log(`Test wallet balance: ${balance / 10n ** 18n} ETH`)
  })

  it('should execute lend operation', async () => {
    // First, verify the vault exists
    console.log(
      `Testing with vault: ${TEST_VAULT.name} (${TEST_VAULT_ADDRESS})`,
    )
    const vaultInfo = await morphoProvider.getVault(TEST_VAULT_ADDRESS)
    console.log(`Vault info: ${vaultInfo.name} - APY: ${vaultInfo.apy}%`)

    // Check USDC balance (wrapped in try-catch as USDC might not be at expected address on fork)
    try {
      const usdcBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [testAccount.address],
      })
      console.log(`Test wallet USDC balance: ${usdcBalance / 10n ** 6n} USDC`)
    } catch {
      console.log(
        `Note: Could not read USDC balance at ${USDC_ADDRESS} - contract might not exist on fork`,
      )
      console.log('Continuing with test...')
    }

    // Since we need USDC, we'll need to either:
    // 1. Get USDC from a faucet
    // 2. Swap ETH for USDC
    // 3. Or use a whale address with USDC
    // For now, let's prepare the transaction with a small amount

    const lendAmount = 1000000n // 1 USDC (6 decimals)

    console.log('Preparing lend transaction...')
    // Call lend with asset (USDC), amount, and vault address
    const lendTx = await morphoProvider.lend(
      USDC_ADDRESS,
      lendAmount,
      TEST_VAULT_ADDRESS,
    )

    expect(lendTx).toBeDefined()
    expect(lendTx.hash).toBeTruthy()
    expect(lendTx.amount).toBe(lendAmount)
    expect(lendTx.asset).toBe(USDC_ADDRESS)
    expect(lendTx.marketId).toBe(TEST_VAULT_ADDRESS)
    expect(lendTx.apy).toBeGreaterThan(0)

    console.log('Lend transaction details:', {
      hash: lendTx.hash,
      amount: lendTx.amount,
      asset: lendTx.asset,
      marketId: lendTx.marketId,
      apy: lendTx.apy,
      timestamp: lendTx.timestamp,
    })

    // Note: The current implementation returns a mock transaction.
    // In a real implementation, we would:
    // 1. Approve USDC spending if needed
    // 2. Execute the actual lend transaction
    // 3. Wait for confirmation

    console.log('Test completed successfully (mock transaction)')
  }, 60000)
})
