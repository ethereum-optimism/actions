import type { Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '@/app.js'
import { buildFrontendWalletProofMessage } from '@/middleware/frontendWalletProof.js'
import * as faucetService from '@/services/faucet.js'

import { successfulFaucetDrip } from './routeTestUtils.js'

const mocks = vi.hoisted(() => ({
  getWalletAddress: vi.fn(),
}))

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
  getActions: () => ({
    wallet: {
      smartWalletProvider: async () => ({
        getWalletAddress: mocks.getWalletAddress,
      }),
    },
  }),
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

const OWNER = privateKeyToAccount(
  '0x1111111111111111111111111111111111111111111111111111111111111111',
)
const OTHER_OWNER = privateKeyToAccount(
  '0x2222222222222222222222222222222222222222222222222222222222222222',
)
const WALLET: Address = '0x3333333333333333333333333333333333333333'
const OTHER_WALLET: Address = '0x4444444444444444444444444444444444444444'
const RATE_LIMIT_WALLET: Address = '0x5555555555555555555555555555555555555555'
const NOW = 1_800_000_000_000
async function createProof(
  walletAddress: Address,
  issuedAt = NOW,
  owner = OWNER,
) {
  const ownerAddress = owner.address
  const signature = await owner.signMessage({
    message: buildFrontendWalletProofMessage({
      issuedAt,
      ownerAddress,
      walletAddress,
    }),
  })
  return { issuedAt, ownerAddress, signature, walletAddress }
}

async function requestDrip(body: unknown, remoteAddress = '127.0.0.1') {
  return createApp().request('/wallet/eth/frontend', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-remote-address': remoteAddress,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /wallet/eth/frontend', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.clearAllMocks()
    mocks.getWalletAddress.mockResolvedValue(WALLET)
    vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(true)
    vi.mocked(faucetService.dripEthToWallet).mockResolvedValue(
      successfulFaucetDrip,
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses the chain-bound canonical proof message', () => {
    expect(
      buildFrontendWalletProofMessage({
        issuedAt: NOW,
        ownerAddress: OWNER.address,
        walletAddress: WALLET,
      }),
    ).toBe(
      [
        'actions-demo:eth-faucet:v1',
        'chainId=11155420',
        `owner=${OWNER.address.toLowerCase()}`,
        `wallet=${WALLET}`,
        `issuedAt=${NOW}`,
      ].join('\n'),
    )
  })

  it('funds the smart wallet derived from a valid owner proof', async () => {
    const res = await requestDrip(await createProof(WALLET))

    expect(res.status).toBe(200)
    expect(mocks.getWalletAddress).toHaveBeenCalledWith({
      nonce: 0n,
      signers: [OWNER.address.toLowerCase()],
    })
    expect(faucetService.dripEthToWallet).toHaveBeenCalledWith(WALLET)
  })

  it('rejects a signature from a different claimed owner', async () => {
    const proof = await createProof(WALLET)

    const res = await requestDrip({
      ...proof,
      ownerAddress: OTHER_OWNER.address,
    })

    expect(res.status).toBe(401)
    expect(mocks.getWalletAddress).not.toHaveBeenCalled()
    expect(faucetService.dripEthToWallet).not.toHaveBeenCalled()
  })

  it.each([
    ['expired', NOW - 300_001],
    ['future-dated', NOW + 30_001],
  ])('rejects a structurally valid %s proof', async (_label, issuedAt) => {
    const res = await requestDrip(await createProof(WALLET, issuedAt))

    expect(res.status).toBe(401)
    expect(mocks.getWalletAddress).not.toHaveBeenCalled()
    expect(faucetService.dripEthToWallet).not.toHaveBeenCalled()
  })

  it('rejects a wallet that differs from the derived smart wallet', async () => {
    mocks.getWalletAddress.mockResolvedValue(OTHER_WALLET)

    const res = await requestDrip(await createProof(WALLET))

    expect(res.status).toBe(401)
    expect(faucetService.dripEthToWallet).not.toHaveBeenCalled()
  })

  it('rejects extra proof fields before verification', async () => {
    const res = await requestDrip({
      ...(await createProof(WALLET)),
      recipientOverride: OTHER_WALLET,
    })

    expect(res.status).toBe(400)
    expect(mocks.getWalletAddress).not.toHaveBeenCalled()
  })

  it('rate-limits repeated proofs from one verified owner', async () => {
    mocks.getWalletAddress.mockResolvedValue(RATE_LIMIT_WALLET)
    vi.mocked(faucetService.isWalletEligibleForFaucet).mockResolvedValue(false)
    const proof = await createProof(RATE_LIMIT_WALLET, NOW, OTHER_OWNER)

    const statuses: number[] = []
    for (let request = 0; request < 11; request++) {
      statuses.push((await requestDrip(proof)).status)
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400))
    expect(statuses[10]).toBe(429)
    expect(faucetService.isWalletEligibleForFaucet).toHaveBeenCalledTimes(10)
  })

  it('limits one connection before wallet proof verification', async () => {
    const statuses: number[] = []
    for (let request = 0; request < 61; request++) {
      statuses.push((await requestDrip({}, '192.0.2.1')).status)
    }

    expect(statuses.slice(0, 60)).toEqual(Array(60).fill(400))
    expect(statuses[60]).toBe(429)
    expect(mocks.getWalletAddress).not.toHaveBeenCalled()
  })
})
