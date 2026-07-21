import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import * as faucetService from '@/services/faucet.js'

vi.mock('@/services/faucet.js', () => ({
  executeFaucetDrip: vi.fn(),
}))

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
  vi.mocked(faucetService.executeFaucetDrip).mockResolvedValue({
    status: 'success',
    userOpHash: `0x${'d'.repeat(64)}`,
  })
})

describe('POST /wallet/eth', () => {
  it('funds a requested wallet without provider authentication', async () => {
    const walletAddress = `0x${'A'.repeat(40)}`
    const normalizedAddress = walletAddress.toLowerCase()

    const response = await requestDrip({ walletAddress }, 'public-drip')

    expect(response.status).toBe(200)
    expect(faucetService.executeFaucetDrip).toHaveBeenCalledWith(
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
    expect(faucetService.executeFaucetDrip).not.toHaveBeenCalled()
  })

  it('rejects a wallet that already has ETH', async () => {
    const walletAddress = `0x${'D'.repeat(40)}`
    vi.mocked(faucetService.executeFaucetDrip).mockResolvedValue({
      status: 'ineligible',
    })

    const response = await requestDrip({ walletAddress }, 'funded-wallet')

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Wallet is not eligible for the faucet',
    })
  })

  it('rejects a wallet within the faucet cooldown', async () => {
    vi.mocked(faucetService.executeFaucetDrip).mockResolvedValue({
      status: 'cooldown',
    })

    const response = await requestDrip(
      { walletAddress: `0x${'7'.repeat(40)}` },
      'cooldown',
    )

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({
      error: 'Faucet already used for this wallet; try again later',
    })
  })

  it('returns a generic error when the faucet workflow fails', async () => {
    vi.mocked(faucetService.executeFaucetDrip).mockResolvedValue({
      status: 'failed',
    })

    const response = await requestDrip(
      { walletAddress: `0x${'8'.repeat(40)}` },
      'failed-drip',
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Failed to drip ETH to wallet',
    })
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
