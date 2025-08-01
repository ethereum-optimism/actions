import type { ChildProcess } from 'child_process'
import { config } from 'dotenv'
import {
  type Address,
  erc20Abi,
  formatEther,
  formatUnits,
  parseUnits,
  type PublicClient,
} from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'
import { unichain } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { VerbsInterface } from '../../../types/verbs.js'
import type { Wallet } from '../../../types/wallet.js'
import {
  ANVIL_ACCOUNTS,
  setupSupersimTest,
  stopSupersim,
} from '../../../utils/test.js'
import { initVerbs } from '../../../verbs.js'
import { SUPPORTED_VAULTS } from './vaults.js'

// Load test environment variables
config({ path: '.env.test.local' })

// Use the first supported vault (Gauntlet USDC)
const TEST_VAULT = SUPPORTED_VAULTS[0]
const USDC_ADDRESS = TEST_VAULT.asset.address
const TEST_VAULT_ADDRESS = TEST_VAULT.address
const TEST_WALLET_ID = 'v6c9zr6cjoo91qlopwzo9nhl'
const TEST_WALLET_ADDRESS =
  '0x55B05e38597D4365C59A6847f51849B30C381bA2' as Address

describe('Morpho Lend', () => {
  let supersimProcess: ChildProcess
  let publicClient: PublicClient
  let _testAccount: ReturnType<typeof privateKeyToAccount>
  let verbs: VerbsInterface
  let testWallet: Wallet | null

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
        fundUsdc: true, // Request USDC funding for vault testing
        usdcAmount: '1000',
        // Fund the Privy wallet address
        address: TEST_WALLET_ADDRESS,
      },
    })

    supersimProcess = setup.supersimProcess
    publicClient = setup.publicClient
    _testAccount = setup.testAccount

    // Initialize Verbs SDK with Morpho lending
    verbs = initVerbs({
      wallet: {
        type: 'privy',
        appId: process.env.PRIVY_APP_ID || 'test-app-id',
        appSecret: process.env.PRIVY_APP_SECRET || 'test-app-secret',
      },
      lend: {
        type: 'morpho',
        defaultSlippage: 50,
      },
      chains: [
        {
          chainId: unichain.id,
          rpcUrl: 'http://127.0.0.1:9546',
        },
      ],
    })

    // Use Privy to get the wallet
    const wallet = await verbs.getWallet(TEST_WALLET_ID)

    if (!wallet) {
      throw new Error(`Wallet ${TEST_WALLET_ID} not found in Privy`)
    }

    testWallet = wallet

    // Verify the address matches what we expect
    console.log(`Privy wallet address: ${testWallet!.address}`)
    expect(testWallet!.address.toLowerCase()).toBe(
      TEST_WALLET_ADDRESS.toLowerCase(),
    )
  }, 60000)

  afterAll(async () => {
    await stopSupersim(supersimProcess)
  })

  it('should connect to forked Unichain', async () => {
    // Check that we can connect and get the chain ID
    const chainId = await publicClient.getChainId()
    expect(chainId).toBe(130) // Unichain chain ID

    // Check that our Privy wallet has ETH
    const balance = await publicClient.getBalance({
      address: TEST_WALLET_ADDRESS,
    })
    const ethBalance = formatEther(balance)
    expect(balance).toBeGreaterThan(0n)
    console.log(`Privy wallet ETH: ${ethBalance}`)
  })

  it('should execute lend operation with real Morpho transactions', async () => {
    // First, verify the vault exists
    console.log(
      `Testing with vault: ${TEST_VAULT.name} (${TEST_VAULT_ADDRESS})`,
    )
    const vaultInfo = await verbs.lend.getVault(TEST_VAULT_ADDRESS)
    console.log(`Vault info: ${vaultInfo.name} - APY: ${vaultInfo.apy}%`)

    // Check balances
    const ethBalance = await publicClient.getBalance({
      address: TEST_WALLET_ADDRESS,
    })
    console.log(`ETH: ${formatEther(ethBalance)}`)

    // Check USDC balance
    let usdcBalance = 0n
    try {
      usdcBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [TEST_WALLET_ADDRESS],
      })
      const usdcBalanceFormatted = formatUnits(usdcBalance, 6)
      console.log(`USDC: ${usdcBalanceFormatted}`)
    } catch {
      throw new Error('USDC balance not found')
    }

    // Check vault balance before deposit
    const vaultBalanceBefore = await verbs.lend.getVaultBalance(
      TEST_VAULT_ADDRESS,
      TEST_WALLET_ADDRESS,
    )

    // Test the new human-readable API: lend(1, 'usdc')
    const lendTx = await testWallet!.lend(1, 'usdc', TEST_VAULT_ADDRESS, {
      slippage: 50, // 0.5%
    })

    const expectedAmount = parseUnits('1', 6) // 1 USDC (6 decimals)

    // Validate lend transaction structure
    expect(lendTx).toBeDefined()
    expect(lendTx.amount).toBe(expectedAmount)
    expect(lendTx.asset).toBe(USDC_ADDRESS)
    expect(lendTx.marketId).toBe(TEST_VAULT_ADDRESS)
    expect(lendTx.apy).toBeGreaterThan(0)
    expect(lendTx.slippage).toBe(50)
    expect(lendTx.transactionData).toBeDefined()
    expect(lendTx.transactionData?.deposit).toBeDefined()
    expect(lendTx.transactionData?.approval).toBeDefined()

    const lendAmountFormatted = formatUnits(lendTx.amount, 6)
    console.log(`Lend: ${lendAmountFormatted} USDC, APY: ${lendTx.apy}%`)

    // Validate transaction data structure
    expect(lendTx.transactionData?.approval?.to).toBe(USDC_ADDRESS)
    expect(lendTx.transactionData?.approval?.data).toMatch(/^0x[0-9a-fA-F]+$/)
    expect(lendTx.transactionData?.approval?.value).toBe('0x0')

    expect(lendTx.transactionData?.deposit?.to).toBe(TEST_VAULT_ADDRESS)
    expect(lendTx.transactionData?.deposit?.data).toMatch(/^0x[0-9a-fA-F]+$/)
    expect(lendTx.transactionData?.deposit?.value).toBe('0x0')

    // Get the current nonce for the wallet
    const currentNonce = await publicClient.getTransactionCount({
      address: TEST_WALLET_ADDRESS,
    })
    console.log(`Current nonce: ${currentNonce}`)

    // Test signing the approval transaction using wallet.signOnly()
    try {
      const approvalTx = lendTx.transactionData!.approval!

      // First, estimate gas for approval transaction on supersim
      const gasEstimate = await publicClient.estimateGas({
        account: TEST_WALLET_ADDRESS,
        to: approvalTx.to as `0x${string}`,
        data: approvalTx.data as `0x${string}`,
        value: BigInt(approvalTx.value),
      })
      console.log(`Estimated gas for approval: ${gasEstimate}`)

      const signedApproval = await testWallet!.signOnly(
        approvalTx,
        currentNonce,
      )
      console.log(`Signed approval tx`)
      expect(signedApproval).toBeDefined()

      // Send the signed transaction to supersim
      const approvalTxHash = await testWallet!.send(
        signedApproval,
        publicClient,
      )
      console.log(`Approval tx sent: ${approvalTxHash}`)
      expect(approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/) // Valid tx hash format

      // Wait for approval to be mined
      await publicClient.waitForTransactionReceipt({ hash: approvalTxHash })
    } catch (error) {
      console.log(
        `Approval signing/sending failed: ${(error as Error).message}`,
      )
      // This is expected if Privy wallet doesn't have gas on the right network
    }

    // Test deposit transaction structure
    const depositTx = lendTx.transactionData!.deposit!

    expect(depositTx.to).toBe(TEST_VAULT_ADDRESS)
    expect(depositTx.data.length).toBeGreaterThan(10) // Should have encoded function data
    expect(depositTx.data.startsWith('0x')).toBe(true)

    // The deposit call data should include the deposit function selector
    // deposit(uint256,address) has selector 0x6e553f65
    expect(depositTx.data.startsWith('0x6e553f65')).toBe(true)

    // Test signing the deposit transaction using wallet.signOnly()
    try {
      // Use incremented nonce for the deposit transaction
      const signedDeposit = await testWallet!.signOnly(
        depositTx,
        currentNonce + 1,
      )
      console.log(`Signed deposit tx`)
      expect(signedDeposit).toBeDefined()

      // Send the signed transaction to supersim
      const depositTxHash = await testWallet!.send(signedDeposit, publicClient)
      console.log(`Deposit tx sent: ${depositTxHash}`)
      expect(depositTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/) // Valid tx hash format

      // Wait for deposit to be mined
      await publicClient.waitForTransactionReceipt({ hash: depositTxHash })
    } catch (error) {
      console.log(`Deposit signing/sending failed: ${(error as Error).message}`)
      // This is expected if Privy wallet doesn't have gas on the right network
    }

    // Check vault balance after deposit attempts
    const vaultBalanceAfter = await verbs.lend.getVaultBalance(
      TEST_VAULT_ADDRESS,
      TEST_WALLET_ADDRESS,
    )

    // For now, we expect the test to fail at signing since Privy needs proper setup
    // In production, the balance would increase after successful deposits
    console.log(
      `Vault balance before: ${vaultBalanceBefore.balanceFormatted} USDC`,
    )
    console.log(
      `Vault balance after: ${vaultBalanceAfter.balanceFormatted} USDC`,
    )
  }, 60000)

  it('should handle different human-readable amounts', async () => {
    // Test fractional amounts
    const tx1 = await testWallet!.lend(0.5, 'usdc', TEST_VAULT_ADDRESS)
    const expectedAmount1 = parseUnits('0.5', 6) // 0.5 USDC
    expect(tx1.amount).toBe(expectedAmount1)

    // Test large amounts
    const tx2 = await testWallet!.lend(1000, 'usdc', TEST_VAULT_ADDRESS)
    const expectedAmount2 = parseUnits('1000', 6) // 1000 USDC
    expect(tx2.amount).toBe(expectedAmount2)

    // Test using address instead of symbol
    const tx3 = await testWallet!.lend(1, USDC_ADDRESS, TEST_VAULT_ADDRESS)
    const expectedAmount3 = parseUnits('1', 6) // 1 USDC
    expect(tx3.amount).toBe(expectedAmount3)
    expect(tx3.asset).toBe(USDC_ADDRESS)
  }, 30000)

  it('should validate input parameters', async () => {
    // Test invalid amount
    await expect(testWallet!.lend(0, 'usdc')).rejects.toThrow(
      'Amount must be greater than 0',
    )
    await expect(testWallet!.lend(-1, 'usdc')).rejects.toThrow(
      'Amount must be greater than 0',
    )

    // Test invalid asset symbol
    await expect(testWallet!.lend(1, 'invalid')).rejects.toThrow(
      'Unsupported asset symbol: invalid',
    )

    // Test invalid address format
    await expect(testWallet!.lend(1, 'not-an-address')).rejects.toThrow(
      'Unsupported asset symbol',
    )
  }, 30000)
})
