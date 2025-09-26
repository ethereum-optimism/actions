import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { request } from 'undici'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { verbsMiddleware } from './middleware/verbs.js'
import { createMockPrivyClient } from './mocks/MockPrivyClient.js'
import { router } from './router.js'

const mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
// Mock the Verbs configuration to avoid external dependencies
// TODO Determine if we want to maintain this mock or have the SDK export tests implementations
vi.mock('./config/verbs.js', () => ({
  initializeVerbs: vi.fn(),
  getPrivyClient: vi.fn(() => mockPrivyClient),
  getVerbs: vi.fn(() => ({
    wallet: {
      createSmartWallet: vi.fn(() =>
        Promise.resolve({
          signer: {
            address: `0x1111111111111111111111111111111111111111`,
          },
          address: `0x1111111111111111111111111111111111111112`,
          getBalance: () =>
            Promise.resolve([
              { symbol: 'USDC', balance: 1000000n },
              { symbol: 'MORPHO', balance: 500000n },
            ]),
          lend: {
            getPosition: vi.fn(
              ({ marketId }: { marketId: { address: string; chainId: number } }) => {
                if (marketId.address === '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9') {
                  return Promise.resolve({
                    balance: 1000000n,
                    balanceFormatted: '1',
                    shares: 1000000n,
                    sharesFormatted: '1',
                    chainId: 130,
                  })
                }
                return Promise.resolve({
                  balance: 0n,
                  balanceFormatted: '0',
                  shares: 0n,
                  sharesFormatted: '0',
                  chainId: marketId.chainId,
                })
              },
            ),
          },
        }),
      ),
      hostedWalletToVerbsWallet: vi.fn(
        async ({ address }: { walletId: string; address: string }) => {
          return {
            address: address,
            signer: {
              address: address,
            },
          }
        },
      ),
      getSmartWallet: vi.fn(
        async ({ signer }: { signer: { address: string } }) => {
          return {
            signer,
            address: signer.address,
            getBalance: () =>
              Promise.resolve([
                { symbol: 'USDC', balance: 1000000n },
                { symbol: 'MORPHO', balance: 500000n },
              ]),
            lend: {
              getPosition: vi.fn(
                ({
                  marketId,
                }: {
                  marketId: { address: string; chainId: number }
                }) => {
                  if (
                    marketId.address === '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9'
                  ) {
                    return Promise.resolve({
                      balance: 1000000n,
                      balanceFormatted: '1',
                      shares: 1000000n,
                      sharesFormatted: '1',
                      chainId: 130,
                    })
                  }
                  return Promise.resolve({
                    balance: 0n,
                    balanceFormatted: '0',
                    shares: 0n,
                    sharesFormatted: '0',
                    chainId: marketId.chainId,
                  })
                },
              ),
            },
          }
        },
      ),
      smartWalletProvider: {
        getWalletAddress: vi.fn(({ owners }: { owners: string[] }) => {
          return Promise.resolve(owners[0])
        }),
        getWallet: vi.fn(
          ({
            walletAddress,
            signer,
            ownerIndex,
          }: {
            walletAddress: string
            signer: string
            ownerIndex: number
          }) => {
            return {
              address: walletAddress,
              getAddress: () => Promise.resolve(walletAddress),
              signer,
              ownerIndex,
            }
          },
        ),
      },
    },
    lend: {
      getMarkets: vi.fn(() =>
        Promise.resolve([
          {
            address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9',
            name: 'Gauntlet USDC',
            asset: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
            apy: 0.03,
            totalAssets: BigInt('16199575764995'),
            totalShares: BigInt('16199575764995'),
            owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0',
            curator: '0x9E33faAE38ff641094fa68c65c2cE600b3410585',
            fee: 0.1,
            lastUpdate: 1234567890,
          },
        ]),
      ),
      getMarket: vi.fn(({ address }: { address: string; chainId: number }) => {
        if (address === '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9') {
          return Promise.resolve({
            address,
            name: 'Gauntlet USDC',
            asset: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
            apy: 0.03,
            apyBreakdown: {
              nativeApy: 0.025,
              totalRewardsApr: 0.01,
              usdc: 0.005,
              morpho: 0.005,
              other: 0,
              performanceFee: 0.1,
              netApy: 0.0325,
            },
            totalAssets: BigInt('16199575764995'),
            totalShares: BigInt('16199575764995'),
            owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0',
            curator: '0x9E33faAE38ff641094fa68c65c2cE600b3410585',
            fee: 0.1,
            lastUpdate: 1234567890,
          })
        }
        throw new Error('Vault not found')
      }),
      getMarketBalance: vi.fn(
        (_marketAddress: string, _walletAddress: string) => {
          return Promise.resolve({
            balance: 1000000n,
            balanceFormatted: '1.0',
            shares: 1000000000000000000n,
            sharesFormatted: '1.0',
            chainId: 130,
          })
        },
      ),
    },
  })),
}))

describe('HTTP API Integration', () => {
  let server: any
  let baseUrl: string

  beforeAll(async () => {
    const testPort = Math.floor(Math.random() * 10000) + 30000

    // Create the same Hono app structure as in the main app
    const app = new Hono()

    app.use(
      '*',
      cors({
        origin: [
          'http://localhost:5173',
          'http://localhost:4173',
          'https://verbs-ui.netlify.app',
          'https://verbs.money',
        ],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      }),
    )

    app.use('*', verbsMiddleware)
    app.route('/', router)

    server = serve({
      fetch: app.fetch,
      port: testPort,
    })

    baseUrl = `http://localhost:${testPort}`

    // Give the server a moment to start
    await new Promise((resolve) => setTimeout(resolve, 500))
  }, 10000)

  afterAll(async () => {
    if (server) {
      server.close()
    }
  })

  describe('Health endpoints', () => {
    it('should respond to health check', async () => {
      const response = await request(`${baseUrl}/`)

      expect(response.statusCode).toBe(200)
      const body = await response.body.text()
      expect(body).toBe('OK')
    })

    it('should return version information', async () => {
      const response = await request(`${baseUrl}/version`)

      expect(response.statusCode).toBe(200)
      const data = (await response.body.json()) as any

      expect(data).toHaveProperty('name')
      expect(data).toHaveProperty('version')
      expect(data).toHaveProperty('description')
      expect(data.name).toBe('@eth-optimism/verbs-service')
    })
  })

  describe('Wallet endpoints', () => {
    const testUserId = `test-user-${Date.now()}`

    it('should create a wallet', async () => {
      const response = await request(`${baseUrl}/wallet/${testUserId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      expect(response.statusCode).toBe(200)
      const data = (await response.body.json()) as any
      expect(data).toHaveProperty('privyAddress')
      expect(data).toHaveProperty('smartWalletAddress')
      expect(data).toHaveProperty('userId')
      expect(data.userId).toBe(testUserId)
      expect(data.smartWalletAddress).toMatch(/^0x[a-zA-Z0-9\-]{1,}$/)
      expect(data.privyAddress).toMatch(/^0x[a-zA-Z0-9\-]{1,}$/)
    })

    it('should get an existing wallet', async () => {
      // First create a wallet
      await request(`${baseUrl}/wallet/${testUserId}`, {
        method: 'POST',
      })
      const walletId = 'mock-wallet-1'

      // Then retrieve it
      const response = await request(`${baseUrl}/wallet/${walletId}`)

      expect(response.statusCode).toBe(200)
      const data = (await response.body.json()) as any

      expect(data).toHaveProperty('address')
      expect(data).toHaveProperty('userId')
    })

    it('should return 404 for non-existent wallet', async () => {
      const nonExistentUserId = `non-existent-${Date.now()}`
      const response = await request(`${baseUrl}/wallet/${nonExistentUserId}`)

      expect(response.statusCode).toBe(404)
      const data = (await response.body.json()) as any

      expect(data).toHaveProperty('error')
      expect(data.error).toBe('Wallet not found')
    })

    it('should validate userId parameter', async () => {
      // Test with empty userId (just spaces)
      const response = await request(`${baseUrl}/wallet/   `, {
        method: 'POST',
      })

      expect(response.statusCode).toBe(404)
      // 404 responses might not be JSON, so check content type
      const contentType = response.headers['content-type']
      if (contentType && contentType.includes('application/json')) {
        const data = (await response.body.json()) as { error: string }
        expect(data).toHaveProperty('error')
      } else {
        // If not JSON, just verify we got a 404
        expect(response.statusCode).toBe(404)
      }
    })

    it('should get all wallets', async () => {
      // Create a couple of test wallets first
      const userId1 = `test-user-list-1-${Date.now()}`
      const userId2 = `test-user-list-2-${Date.now()}`

      await request(`${baseUrl}/wallet/${userId1}`, { method: 'POST' })
      await request(`${baseUrl}/wallet/${userId2}`, { method: 'POST' })

      const response = await request(`${baseUrl}/wallets`)

      expect(response.statusCode).toBe(200)
      const data = (await response.body.json()) as any

      expect(data).toHaveProperty('wallets')
      expect(data).toHaveProperty('count')
      expect(Array.isArray(data.wallets)).toBe(true)
      expect(data.count).toBeGreaterThanOrEqual(2)

      // Check wallet structure
      if (data.wallets.length > 0) {
        expect(data.wallets[0]).toHaveProperty('address')
        expect(data.wallets[0].address).toMatch(/^0x[a-zA-Z0-9\-]{1,}$/)
      }
    })

    it('should handle wallet list query parameters', async () => {
      const response = await request(`${baseUrl}/wallets?limit=1`)

      expect(response.statusCode).toBe(200)
      const data = (await response.body.json()) as any

      // Note: The actual limit behavior depends on the Verbs SDK implementation
      // We're just testing that the endpoint handles query parameters without error
      expect(data).toHaveProperty('wallets')
      expect(data).toHaveProperty('count')
    })

    it('should get wallet balance', async () => {
      // First create a wallet
      await request(`${baseUrl}/wallet/${testUserId}`, {
        method: 'POST',
      })
      const walletId = 'mock-wallet-1'

      const response = await request(`${baseUrl}/wallet/${walletId}/balance`)

      expect(response.statusCode).toBe(200)
      const data = (await response.body.json()) as any

      expect(data).toEqual({
        balance: [
          { symbol: 'USDC', balance: '1000000' },
          { symbol: 'MORPHO', balance: '500000' },
          {
            symbol: 'Gauntlet USDC',
            totalBalance: '1000000',
            totalFormattedBalance: '1',
            chainBalances: [
              {
                chainId: 130,
                balance: '1000000',
                tokenAddress: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
                formattedBalance: '1',
              },
            ],
          },
        ],
      })
    })

    it('should return error for balance of non-existent wallet', async () => {
      const nonExistentUserId = `non-existent-balance-${Date.now()}`
      const response = await request(
        `${baseUrl}/wallet/${nonExistentUserId}/balance`,
      )

      expect(response.statusCode).toBe(500)
      const data = (await response.body.json()) as any

      expect(data).toEqual({
        error: 'Failed to get balance',
        message: 'Wallet not found',
      })
    })
  })

  describe('CORS', () => {
    it('should handle preflight requests', async () => {
      const response = await request(`${baseUrl}/`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      })

      expect(response.statusCode).toBe(204)
      expect(response.headers['access-control-allow-origin']).toBeDefined()
      expect(response.headers['access-control-allow-methods']).toBeDefined()
    })
  })

  describe('Error handling', () => {
    it('should handle invalid routes', async () => {
      const response = await request(`${baseUrl}/invalid-route`)

      expect(response.statusCode).toBe(404)
    })

    it('should handle malformed requests', async () => {
      const response = await request(`${baseUrl}/wallet/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid-json{',
      })

      // Should either be 400 (bad request) or the endpoint should handle it gracefully
      expect([400, 404].includes(response.statusCode)).toBe(true)
    })
  })

  describe('Lend endpoints', () => {
    it('should get all markets', async () => {
      const response = await request(`${baseUrl}/lend/markets`)

      expect(response.statusCode).toBe(200)
      const data = (await response.body.json()) as any

      expect(data).toHaveProperty('markets')
      expect(Array.isArray(data.markets)).toBe(true)
      expect(data.markets.length).toBeGreaterThan(0)

      // Check market structure
      const vault = data.markets[0]
      expect(vault).toHaveProperty('address')
      expect(vault).toHaveProperty('name')
      expect(vault).toHaveProperty('apy')
      expect(vault).toHaveProperty('asset')
      expect(vault.address).toBe('0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9')
      expect(vault.name).toBe('Gauntlet USDC')
      expect(typeof vault.apy).toBe('number')
    })

    it('should get specific market info', async () => {
      const vaultAddress = '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9'
      const response = await request(
        `${baseUrl}/lend/market/130/${vaultAddress}`,
      )

      expect(response.statusCode).toBe(200)
      const data = (await response.body.json()) as any

      expect(data).toHaveProperty('market')
      const vault = data.market
      expect(vault).toHaveProperty('address')
      expect(vault).toHaveProperty('name')
      expect(vault).toHaveProperty('apy')
      expect(vault).toHaveProperty('apyBreakdown')
      expect(vault).toHaveProperty('asset')
      expect(vault).toHaveProperty('totalAssets')
      expect(vault).toHaveProperty('totalShares')
      expect(vault).toHaveProperty('fee')
      expect(vault).toHaveProperty('owner')
      expect(vault).toHaveProperty('curator')
      expect(vault).toHaveProperty('lastUpdate')

      // Validate APY breakdown structure
      expect(vault.apyBreakdown).toHaveProperty('nativeApy')
      expect(vault.apyBreakdown).toHaveProperty('totalRewardsApr')
      expect(vault.apyBreakdown).toHaveProperty('performanceFee')
      expect(vault.apyBreakdown).toHaveProperty('netApy')

      expect(vault.address).toBe(vaultAddress)
      expect(vault.name).toBe('Gauntlet USDC')
      expect(typeof vault.apy).toBe('number')
      expect(typeof vault.totalAssets).toBe('string') // BigInt serialized as string
      expect(typeof vault.fee).toBe('number')
    })

    it('should return 400 for missing market address', async () => {
      const response = await request(`${baseUrl}/lend/market/`)

      expect(response.statusCode).toBe(404) // Will be 404 since route doesn't match
    })

    it('should handle market not found', async () => {
      const invalidVaultAddress = '0x1234567890123456789012345678901234567890'
      const response = await request(
        `${baseUrl}/lend/market/130/${invalidVaultAddress}`,
      )

      expect(response.statusCode).toBe(500)
      const data = (await response.body.json()) as any

      expect(data).toHaveProperty('error')
      expect(data.error).toBe('Failed to get market info')
      expect(data).toHaveProperty('message')
      expect(data.message).toContain('Vault not found')
    })
  })
})
