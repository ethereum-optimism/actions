// import { isAddress } from 'viem'
// import { unichain } from 'viem/chains'
// import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// import type { ChainManager } from '@/services/ChainManager.js'
// import { MockChainManager } from '@/test/MockChainManager.js'
// import { createMockLendProvider } from '@/test/MockLendProvider.js'
// import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
// import { getRandomAddress } from '@/test/utils.js'
// import { DefaultSmartWallet } from '@/wallet/DefaultSmartWallet.js'
// import { PrivyWallet } from '@/wallet/PrivyWallet.js'
// import { DefaultSmartWalletProvider } from '@/wallet/providers/DefaultSmartWalletProvider.js'
// import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'
// import { WalletNamespace } from '@/wallet/WalletNamespace.js'
// import { WalletProvider } from '@/wallet/WalletProvider.js'
// import { PrivyClient } from '@privy-io/server-auth'

// const mockChainManager = new MockChainManager({
//   supportedChains: [unichain.id],
// }) as unknown as ChainManager
// const mockLendProvider = createMockLendProvider()

// describe('WalletNamespace', () => {
//   let mockPrivyClient: PrivyClient
//   beforeEach(() => {
//     mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
//   })

//   afterEach(() => {
//     vi.clearAllMocks()
//   })

//   it('should provide access to hosted wallet provider', () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const walletNamespace = new WalletNamespace(walletProvider)

//     expect(walletNamespace.hostedWalletProvider).toBe(hostedWalletProvider)
//   })

//   it('should provide access to smart wallet provider', () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const walletNamespace = new WalletNamespace(walletProvider)

//     expect(walletNamespace.smartWalletProvider).toBe(smartWalletProvider)
//   })

//   it('should create a hosted wallet via namespace', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const createHostedWalletSpy = vi.spyOn(walletProvider, 'createHostedWallet')
//     const walletNamespace = new WalletNamespace(walletProvider)

//     const wallet: PrivyWallet =
//       (await walletNamespace.createHostedWallet()) as PrivyWallet

//     expect(wallet).toBeInstanceOf(PrivyWallet)
//     expect(wallet.walletId).toMatch(/^mock-wallet-\d+$/)
//     expect(isAddress(wallet.address)).toBe(true)
//     expect(createHostedWalletSpy).toHaveBeenCalledOnce()
//   })

//   it('should create a smart wallet with provided signer and owners', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const createSmartWalletSpy = vi.spyOn(walletProvider, 'createSmartWallet')
//     const walletNamespace = new WalletNamespace(walletProvider)

//     // Create a hosted wallet to use as signer
//     const privyWallet = await mockPrivyClient.walletApi.createWallet({ chainType: 'ethereum' })
//     const hostedWallet = await walletProvider.hostedWalletProvider.toVerbsWallet({ walletId: privyWallet.id, address: privyWallet.address })
//     const account = await hostedWallet.account()
//     const owners = [getRandomAddress(), hostedWallet.address]
//     const nonce = BigInt(123)

//     const smartWallet = await walletNamespace.createSmartWallet({
//       owners,
//       signer: account,
//       nonce,
//     })

//     expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
//     expect(smartWallet.signer).toBe(account)
//     expect(createSmartWalletSpy).toHaveBeenCalledWith({
//       owners,
//       signer: account,
//       nonce,
//     })
//   })

//   it('should create a wallet with hosted signer (default owners)', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//       mockLendProvider,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const createWalletWithHostedSignerSpy = vi.spyOn(
//       walletProvider,
//       'createWalletWithHostedSigner',
//     )
//     const walletNamespace = new WalletNamespace(walletProvider)

//     const smartWallet = await walletNamespace.createWalletWithHostedSigner()

//     expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
//     expect(createWalletWithHostedSignerSpy).toHaveBeenCalledWith(undefined)
//   })

//   it('should create a wallet with hosted signer and additional owners', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//       mockLendProvider,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const createWalletWithHostedSignerSpy = vi.spyOn(
//       walletProvider,
//       'createWalletWithHostedSigner',
//     )
//     const walletNamespace = new WalletNamespace(walletProvider)

//     const additionalOwners = [getRandomAddress(), getRandomAddress()]
//     const hostedWalletIndex = 1
//     const nonce = BigInt(456)
//     const params = {
//       owners: additionalOwners,
//       hostedWalletIndex,
//       nonce,
//     }

//     const smartWallet =
//       await walletNamespace.createWalletWithHostedSigner(params)

//     expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
//     expect(createWalletWithHostedSignerSpy).toHaveBeenCalledWith(params)
//   })

//   it('should get a hosted wallet by ID', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//       mockLendProvider,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const getHostedWalletSpy = vi.spyOn(walletProvider, 'getHostedWallet')
//     const walletNamespace = new WalletNamespace(walletProvider)

//     const createdWallet = await hostedWalletProvider.createWallet()
//     const walletId = createdWallet.walletId

//     const wallet: PrivyWallet = (await walletNamespace.getHostedWallet({
//       walletId,
//     })) as PrivyWallet

//     expect(wallet).toBeInstanceOf(PrivyWallet)
//     expect(wallet.walletId).toBe(walletId)
//     expect(getHostedWalletSpy).toHaveBeenCalledWith({ walletId })
//   })

//   it('should get a smart wallet with hosted signer', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//       mockLendProvider,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const getSmartWalletWithHostedSignerSpy = vi.spyOn(
//       walletProvider,
//       'getSmartWalletWithHostedSigner',
//     )
//     const walletNamespace = new WalletNamespace(walletProvider)

//     const hostedWallet = await hostedWalletProvider.createWallet()
//     const walletId = hostedWallet.walletId
//     const deploymentOwners = [hostedWallet.address]
//     const signerOwnerIndex = 0
//     const params = {
//       walletId,
//       deploymentOwners,
//       signerOwnerIndex,
//     }

//     const smartWallet =
//       await walletNamespace.getSmartWalletWithHostedSigner(params)

//     expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
//     expect(getSmartWalletWithHostedSignerSpy).toHaveBeenCalledWith(params)
//   })

//   it('should get a smart wallet with provided signer', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//       mockLendProvider,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const getSmartWalletSpy = vi.spyOn(walletProvider, 'getSmartWallet')
//     const walletNamespace = new WalletNamespace(walletProvider)

//     const hostedWallet = await hostedWalletProvider.createWallet()
//     const account = await hostedWallet.account()
//     const deploymentOwners = [hostedWallet.address, getRandomAddress()]
//     const signerOwnerIndex = 0
//     const nonce = BigInt(789)
//     const params = {
//       signer: account,
//       deploymentOwners,
//       signerOwnerIndex,
//       nonce,
//     }

//     const smartWallet = await walletNamespace.getSmartWallet(params)

//     expect(smartWallet).toBeInstanceOf(DefaultSmartWallet)
//     expect(getSmartWalletSpy).toHaveBeenCalledWith(params)
//   })

//   it('should throw error when getting smart wallet without required parameters', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//       mockLendProvider,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const walletNamespace = new WalletNamespace(walletProvider)

//     const hostedWallet = await hostedWalletProvider.createWallet()
//     const account = await hostedWallet.account()

//     await expect(
//       walletNamespace.getSmartWallet({
//         signer: account,
//         // Missing both walletAddress and deploymentOwners
//       }),
//     ).rejects.toThrow(
//       'Either walletAddress or deploymentOwners array must be provided to locate the smart wallet',
//     )
//   })

//   it('should throw error when hosted wallet is not found', async () => {
//     const mockPrivyClient = createMockPrivyClient(
//       'test-app-id',
//       'test-app-secret',
//     )
//     const hostedWalletProvider = new PrivyHostedWalletProvider(
//       mockPrivyClient,
//       mockChainManager,
//       mockLendProvider,
//     )
//     const smartWalletProvider = new DefaultSmartWalletProvider(
//       mockChainManager,
//       mockLendProvider,
//     )
//     const walletProvider = new WalletProvider(
//       hostedWalletProvider,
//       smartWalletProvider,
//     )
//     const walletNamespace = new WalletNamespace(walletProvider)

//     const invalidWalletId = 'invalid-wallet-id'

//     await expect(
//       walletNamespace.getSmartWalletWithHostedSigner({
//         walletId: invalidWalletId,
//       }),
//     ).rejects.toThrow('Failed to get wallet with id: invalid-wallet-id')
//   })
// })
