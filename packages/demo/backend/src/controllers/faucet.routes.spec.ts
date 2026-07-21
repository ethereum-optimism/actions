import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import * as faucetService from '@/services/faucet.js'

import { successfulFaucetDrip } from './routeTestUtils.js'

vi.mock('@/services/faucet.js', async (importOriginal) => {
  const actual = await importOriginal<typeof faucetService>()
  return {
    ...actual,
    isWalletEligibleForFaucet: vi.fn(),
    dripEthToWallet: vi.fn(),
  }
})

vi.mock('@/config/actions.js', () => ({
  initializeActions: vi.fn(),
  getActions: vi.fn(() => ({})),
  getPrivyClient: vi.fn(),
}))

vi.mock('@/middleware/actions.js', () => ({
  actionsMiddleware: async (_c: unknown, next: () => Promise<void>) => {
    await next()
  },
}))

vi.mock('@hono/node-server/conninfo', () => ({
  getConnInfo: (c: {
    req: { header: (name: string) => string | undefined }
  }) => ({
    remote: { address: c.req.header('x-test-remote-address') },
  }),
}))

function requestDrip(body: unknown, remoteAddress: string) {
  return createApp().request('/wallet/eth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-remote-address': remoteAddress,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(true)
  vi.mocked(faucetService.dripEthToWallet).mockResolvedValue(
    successfulFaucetDrip,
  )
})

describe('POST /wallet/eth', () => {
  it('funds a requested wallet without provider authentication', async () => {
    const walletAddress = `0x${'A'.repeat(40)}`
    const normalizedAddress = walletAddress.toLowerCase()

    const response = await requestDrip({ walletAddress }, 'public-drip')

    expect(response.status).toBe(200)
    expect(faucetService.isWalletEligibleForFaucet).toHaveBeenCalledWith(
      normalizedAddress,
    )
    expect(faucetService.dripEthToWallet).toHaveBeenCalledWith(
      normalizedAddress,
    )
  })

  it.each([
    ['missing', {}],
    ['invalid', { walletAddress: '0x1234' }],
    [
      'unexpected fields',
      {
        walletAddress: `0x${'2'.repeat(40)}`,
        recipientOverride: `0x${'3'.repeat(40)}`,
      },
    ],
  ])('rejects %s wallet input', async (_label, body) => {
    const response = await requestDrip(body, 'invalid-input')

    expect(response.status).toBe(400)
    expect(faucetService.isWalletEligibleForFaucet).not.toHaveBeenCalled()
    expect(faucetService.dripEthToWallet).not.toHaveBeenCalled()
  })

  it('rejects a wallet that already has ETH', async () => {
    const walletAddress = `0x${'D'.repeat(40)}`
    vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(false)

    const response = await requestDrip({ walletAddress }, 'funded-wallet')

    expect(response.status).toBe(400)
    expect(faucetService.dripEthToWallet).not.toHaveBeenCalled()
  })

  it('drips once under concurrent requests for one wallet', async () => {
    const walletAddress = `0x${'C'.repeat(40)}`
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        requestDrip({ walletAddress }, 'concurrent-drip'),
      ),
    )

    const statuses = responses.map(({ status }) => status)
    expect(statuses.filter((status) => status === 200)).toHaveLength(1)
    expect(statuses.filter((status) => status === 429)).toHaveLength(5)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledTimes(1)
  })

  it('releases a reservation after an unsuccessful submission', async () => {
    const walletAddress = `0x${'7'.repeat(40)}`
    vi.mocked(faucetService.dripEthToWallet)
      .mockResolvedValueOnce({ ...successfulFaucetDrip, success: false })
      .mockResolvedValueOnce(successfulFaucetDrip)

    const failed = await requestDrip({ walletAddress }, 'unsuccessful-drip')
    const retried = await requestDrip({ walletAddress }, 'unsuccessful-drip')

    expect(failed.status).toBe(500)
    expect(retried.status).toBe(200)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledTimes(2)
  })

  it('releases a reservation after a rejected submission', async () => {
    const walletAddress = `0x${'8'.repeat(40)}`
    vi.mocked(faucetService.dripEthToWallet)
      .mockRejectedValueOnce(new Error('bundler down'))
      .mockResolvedValueOnce(successfulFaucetDrip)

    const failed = await requestDrip({ walletAddress }, 'rejected-drip')
    const retried = await requestDrip({ walletAddress }, 'rejected-drip')

    expect(failed.status).toBe(500)
    expect(retried.status).toBe(200)
    expect(faucetService.dripEthToWallet).toHaveBeenCalledTimes(2)
  })

  it('rate-limits one connection without affecting another', async () => {
    const statuses: number[] = []
    for (let request = 0; request < 11; request++) {
      statuses.push((await requestDrip({}, 'limited-connection')).status)
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400))
    expect(statuses[10]).toBe(429)
    expect((await requestDrip({}, 'other-connection')).status).toBe(400)
  })
})
