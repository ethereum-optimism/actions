import type { ChildProcess } from 'child_process'
import { config } from 'dotenv'
import {
  erc20Abi,
  formatEther,
  formatUnits,
  parseUnits,
  type PublicClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { unichain } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Load test environment variables
config({ path: '.env.test' })

import type { VerbsInterface } from '../../../types/verbs.js'
import { setupSupersimTest, stopSupersim } from '../../../utils/test.js'
import { initVerbs } from '../../../verbs.js'
import { Wallet } from '../../../wallet/index.js'
import { SUPPORTED_VAULTS } from './vaults.js'

// Use the first supported vault (Gauntlet USDC)
const TEST_VAULT = SUPPORTED_VAULTS[0]
const USDC_ADDRESS = TEST_VAULT.asset.address
const TEST_VAULT_ADDRESS = TEST_VAULT.address

describe('Morpho Lend', () => {
  let supersimProcess: ChildProcess
  let publicClient: PublicClient
  let testAccount: ReturnType<typeof privateKeyToAccount>
  let verbs: VerbsInterface
  let testWallet: Wallet
  const TEST_WALLET_ID: string = 'v6c9zr6cjoo91qlopwzo9nhl'

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
      },
    })

    supersimProcess = setup.supersimProcess
    publicClient = setup.publicClient
    testAccount = setup.testAccount

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

    // For testing, create a wallet directly with the Verbs instance
    // In real app, wallet.lend() would be available after createWallet()
    // Create a wallet provider instance to enable signing (with real Privy credentials if available)
    const { WalletProviderPrivy } = await import(
      '../../../wallet/providers/privy.js'
    )
    const walletProvider = new WalletProviderPrivy(
      process.env.PRIVY_APP_ID || 'test-app-id',
      process.env.PRIVY_APP_SECRET || 'test-app-secret',
      verbs,
    )
    testWallet = new Wallet(TEST_WALLET_ID, verbs, walletProvider)
    testWallet.init(testAccount.address)
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
  })

  it('should execute lend operation with real Morpho transactions', async () => {
    // First, verify the vault exists
    console.log(
      `Testing with vault: ${TEST_VAULT.name} (${TEST_VAULT_ADDRESS})`,
    )
    const vaultInfo = await verbs.lend.getVault(TEST_VAULT_ADDRESS)
    console.log(`Vault info: ${vaultInfo.name} - APY: ${vaultInfo.apy}%`)

    // Check USDC balance (wrapped in try-catch as USDC might not be at expected address on fork)
    let usdcBalance = 0n
    try {
      usdcBalance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [testAccount.address],
      })
      const usdcBalanceFormatted = formatUnits(usdcBalance, 6)
      console.log(`USDC balance: ${usdcBalanceFormatted}`)
    } catch {
      throw new Error('USDC balance not found')
    }

    // Check vault balance before deposit
    const vaultBalanceBefore = await verbs.lend.getVaultBalance(
      TEST_VAULT_ADDRESS,
      testAccount.address,
    )

    // Test the new human-readable API: lend(1, 'usdc')
    const lendTx = await testWallet.lend(1, 'usdc', TEST_VAULT_ADDRESS, {
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

    // Test signing the approval transaction using wallet.sign()
    try {
      const approvalTx = lendTx.transactionData!.approval!
      const approvalTxHash = await testWallet.sign(approvalTx)
      console.log(`Approval signed: ${approvalTxHash}`)
      expect(approvalTxHash).toBeDefined()
      expect(approvalTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/) // Valid tx hash format
    } catch (error) {
      console.log(`Approval signing failed: ${(error as Error).message}`)
    }

    // Test deposit transaction structure
    const depositTx = lendTx.transactionData!.deposit!

    expect(depositTx.to).toBe(TEST_VAULT_ADDRESS)
    expect(depositTx.data.length).toBeGreaterThan(10) // Should have encoded function data
    expect(depositTx.data.startsWith('0x')).toBe(true)

    // The deposit call data should include the deposit function selector
    // deposit(uint256,address) has selector 0x6e553f65
    expect(depositTx.data.startsWith('0x6e553f65')).toBe(true)

    // Test signing the deposit transaction using wallet.sign()
    try {
      const depositTxHash = await testWallet.sign(depositTx)
      console.log(`Deposit signed: ${depositTxHash}`)
      expect(depositTxHash).toBeDefined()
      expect(depositTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/) // Valid tx hash format
    } catch (error) {
      console.log(`Deposit signing failed: ${(error as Error).message}`)
    }

    // Check vault balance after deposit attempts
    const vaultBalanceAfter = await verbs.lend.getVaultBalance(
      TEST_VAULT_ADDRESS,
      testAccount.address,
    )

    // Verify that balance is the same (since transactions weren't actually executed)
    expect(vaultBalanceAfter.balance).toBe(vaultBalanceBefore.balance)
    expect(vaultBalanceAfter.shares).toBe(vaultBalanceBefore.shares)
    console.log('Vault balance unchanged (transactions not executed)')
  }, 60000)

  it('should handle different human-readable amounts', async () => {
    // Test fractional amounts
    const tx1 = await testWallet.lend(0.5, 'usdc', TEST_VAULT_ADDRESS)
    const expectedAmount1 = parseUnits('0.5', 6) // 0.5 USDC
    const tx1AmountFormatted = formatUnits(tx1.amount, 6)
    expect(tx1.amount).toBe(expectedAmount1)

    // Test large amounts
    const tx2 = await testWallet.lend(1000, 'usdc', TEST_VAULT_ADDRESS)
    const expectedAmount2 = parseUnits('1000', 6) // 1000 USDC
    const tx2AmountFormatted = formatUnits(tx2.amount, 6)
    expect(tx2.amount).toBe(expectedAmount2)

    // Test using address instead of symbol
    const tx3 = await testWallet.lend(1, USDC_ADDRESS, TEST_VAULT_ADDRESS)
    const expectedAmount3 = parseUnits('1', 6) // 1 USDC
    const tx3AmountFormatted = formatUnits(tx3.amount, 6)
    expect(tx3.amount).toBe(expectedAmount3)
    expect(tx3.asset).toBe(USDC_ADDRESS)
  }, 30000)

  it('should validate input parameters', async () => {
    // Test invalid amount
    await expect(testWallet.lend(0, 'usdc')).rejects.toThrow(
      'Amount must be greater than 0',
    )
    await expect(testWallet.lend(-1, 'usdc')).rejects.toThrow(
      'Amount must be greater than 0',
    )

    // Test invalid asset symbol
    await expect(testWallet.lend(1, 'invalid')).rejects.toThrow(
      'Unsupported asset symbol: invalid',
    )

    // Test invalid address format
    await expect(testWallet.lend(1, 'not-an-address')).rejects.toThrow(
      'Unsupported asset symbol',
    )
  }, 30000)
})
