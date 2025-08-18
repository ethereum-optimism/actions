// import { type Address, encodeFunctionData, erc20Abi, parseUnits } from 'viem'
// import { unichain } from 'viem/chains'
// import { beforeEach, describe, expect, it } from 'vitest'

// import type { VerbsInterface } from '../types/verbs.js'
// import { initVerbs } from '../verbs.js'
// import { Wallet } from './index.js'

// describe('Wallet SendTokens', () => {
//   let verbs: VerbsInterface
//   let wallet: Wallet
//   const testAddress: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
//   const recipientAddress: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

//   beforeEach(() => {
//     // Initialize Verbs SDK
//     verbs = initVerbs({
//       wallet: {
//         type: 'privy',
//         appId: 'test-app-id',
//         appSecret: 'test-app-secret',
//       },
//       chains: [
//         {
//           chainId: unichain.id,
//           rpcUrl: 'http://localhost:9546',
//         },
//       ],
//     })

//     // Create wallet instance
//     wallet = new Wallet('test-wallet', verbs)
//     wallet.init(testAddress)
//   })

//   describe('ETH transfers', () => {
//     it('should create valid ETH transfer transaction data', async () => {
//       const transferData = await wallet.sendTokens(1.5, 'eth', recipientAddress)

//       expect(transferData).toEqual({
//         to: recipientAddress,
//         value: `0x${parseUnits('1.5', 18).toString(16)}`,
//         data: '0x',
//       })
//     })

//     it('should handle fractional ETH amounts correctly', async () => {
//       const transferData = await wallet.sendTokens(
//         0.001,
//         'eth',
//         recipientAddress,
//       )
//       const expectedValue = parseUnits('0.001', 18)

//       expect(transferData.to).toBe(recipientAddress)
//       expect(transferData.value).toBe(`0x${expectedValue.toString(16)}`)
//       expect(transferData.data).toBe('0x')
//     })

//     it('should handle large ETH amounts correctly', async () => {
//       const transferData = await wallet.sendTokens(100, 'eth', recipientAddress)
//       const expectedValue = parseUnits('100', 18)

//       expect(transferData.to).toBe(recipientAddress)
//       expect(transferData.value).toBe(`0x${expectedValue.toString(16)}`)
//       expect(transferData.data).toBe('0x')
//     })
//   })

//   describe('USDC transfers', () => {
//     const usdcAddress = '0x078d782b760474a361dda0af3839290b0ef57ad6' // USDC on Unichain

//     it('should create valid USDC transfer transaction data', async () => {
//       const transferData = await wallet.sendTokens(
//         100,
//         'usdc',
//         recipientAddress,
//       )
//       const expectedAmount = parseUnits('100', 6) // USDC has 6 decimals

//       const expectedData = encodeFunctionData({
//         abi: erc20Abi,
//         functionName: 'transfer',
//         args: [recipientAddress, expectedAmount],
//       })

//       expect(transferData).toEqual({
//         to: usdcAddress,
//         value: '0x0',
//         data: expectedData,
//       })
//     })

//     it('should handle fractional USDC amounts correctly', async () => {
//       const transferData = await wallet.sendTokens(
//         0.5,
//         'usdc',
//         recipientAddress,
//       )
//       const expectedAmount = parseUnits('0.5', 6) // USDC has 6 decimals

//       const expectedData = encodeFunctionData({
//         abi: erc20Abi,
//         functionName: 'transfer',
//         args: [recipientAddress, expectedAmount],
//       })

//       expect(transferData.to).toBe(usdcAddress)
//       expect(transferData.value).toBe('0x0')
//       expect(transferData.data).toBe(expectedData)
//     })

//     it('should handle USDC by token address', async () => {
//       const transferData = await wallet.sendTokens(
//         50,
//         usdcAddress,
//         recipientAddress,
//       )
//       const expectedAmount = parseUnits('50', 6) // USDC has 6 decimals

//       const expectedData = encodeFunctionData({
//         abi: erc20Abi,
//         functionName: 'transfer',
//         args: [recipientAddress, expectedAmount],
//       })

//       expect(transferData.to).toBe(usdcAddress)
//       expect(transferData.value).toBe('0x0')
//       expect(transferData.data).toBe(expectedData)
//     })
//   })

//   describe('validation', () => {
//     it('should throw error if wallet is not initialized', async () => {
//       const uninitializedWallet = new Wallet('test-wallet', verbs)

//       await expect(
//         uninitializedWallet.sendTokens(1, 'eth', recipientAddress),
//       ).rejects.toThrow('Wallet not initialized')
//     })

//     it('should throw error for zero amount', async () => {
//       await expect(
//         wallet.sendTokens(0, 'eth', recipientAddress),
//       ).rejects.toThrow('Amount must be greater than 0')
//     })

//     it('should throw error for negative amount', async () => {
//       await expect(
//         wallet.sendTokens(-1, 'eth', recipientAddress),
//       ).rejects.toThrow('Amount must be greater than 0')
//     })

//     it('should throw error for empty recipient address', async () => {
//       await expect(wallet.sendTokens(1, 'eth', '' as Address)).rejects.toThrow(
//         'Recipient address is required',
//       )
//     })

//     it('should throw error for unsupported asset symbol', async () => {
//       await expect(
//         wallet.sendTokens(1, 'invalid-token', recipientAddress),
//       ).rejects.toThrow('Unsupported asset symbol: invalid-token')
//     })

//     it('should throw error for invalid token address', async () => {
//       await expect(
//         wallet.sendTokens(1, '0xinvalid', recipientAddress),
//       ).rejects.toThrow('Unknown asset address')
//     })
//   })

//   describe('asset symbol case insensitivity', () => {
//     it('should handle uppercase ETH', async () => {
//       const transferData = await wallet.sendTokens(1, 'ETH', recipientAddress)
//       expect(transferData.to).toBe(recipientAddress)
//       expect(transferData.data).toBe('0x')
//     })

//     it('should handle mixed case USDC', async () => {
//       const usdcAddress = '0x078d782b760474a361dda0af3839290b0ef57ad6'
//       const transferData = await wallet.sendTokens(1, 'UsDc', recipientAddress)
//       expect(transferData.to).toBe(usdcAddress)
//       expect(transferData.value).toBe('0x0')
//     })
//   })
// })
