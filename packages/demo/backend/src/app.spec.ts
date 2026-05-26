import { afterEach, describe, expect, it, vi } from 'vitest'

const TEST_ENV = {
  PORT: 3000,
  PRIVY_APP_ID: 'dummy',
  PRIVY_APP_SECRET: 'dummy',
  LOCAL_DEV: false,
  BASE_SEPOLIA_RPC_URL: undefined,
  UNICHAIN_RPC_URL: undefined,
  FAUCET_ADMIN_PRIVATE_KEY:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  FAUCET_ADDRESS: '0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8',
  BASE_SEPOLIA_BUNDLER_URL: 'dummy',
  UNICHAIN_BUNDLER_URL: 'dummy',
  UNICHAIN_BUNDLER_SPONSORSHIP_POLICY: 'dummy',
  SESSION_SIGNER_PK:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7BF4F2ff80',
  AUTH_MODULE_ADDRESS: 'dummy',
  OP_SEPOLIA_RPC_URL: undefined,
  OP_SEPOLIA_BUNDLER_URL: 'dummy',
  FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY: 'dummy',
  OP_SEPOLIA_FAUCET_ADDRESS: 'dummy',
} as const

async function requestWithOrigin(localDev: boolean, origin: string) {
  vi.resetModules()
  vi.doMock('@/config/env.js', () => ({
    env: { ...TEST_ENV, LOCAL_DEV: localDev },
  }))

  const { createApp } = await import('@/app.js')
  return await createApp().request('/borrow/markets', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
    },
  })
}

afterEach(() => {
  vi.doUnmock('@/config/env.js')
  vi.resetModules()
})

describe('createApp CORS', () => {
  it('allows localhost origins only in local dev', async () => {
    const origin = 'http://localhost:5173'

    const localResponse = await requestWithOrigin(true, origin)
    expect(localResponse.headers.get('access-control-allow-origin')).toBe(
      origin,
    )

    const deployedResponse = await requestWithOrigin(false, origin)
    expect(
      deployedResponse.headers.get('access-control-allow-origin'),
    ).toBeNull()
  })

  it('allows production origins outside local dev', async () => {
    const origin = 'https://actions.optimism.io'
    const response = await requestWithOrigin(false, origin)

    expect(response.headers.get('access-control-allow-origin')).toBe(origin)
  })
})
