import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runAssets } from '@/commands/assets.js'
import * as baseCtx from '@/context/baseContext.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

describe('runAssets', () => {
  const writeSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true)

  afterEach(() => {
    writeSpy.mockClear()
    vi.restoreAllMocks()
  })

  it('emits the configured allowlist as JSON', async () => {
    const allow = [
      {
        address: {},
        metadata: { decimals: 6, name: 'USDC', symbol: 'USDC_DEMO' },
        type: 'erc20' as const,
      },
    ]
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: { chains: [] } as never,
      actions: { getSupportedAssets: () => allow } as never,
    })
    writeSpy.mockImplementation(() => true)
    await runAssets()
    const body = JSON.parse(String(writeSpy.mock.calls[0]?.[0]))
    expect(body).toEqual(allow)
  })

  it('propagates SDK errors for writeError to handle', async () => {
    vi.spyOn(baseCtx, 'baseContext').mockReturnValue({
      config: { chains: [] } as never,
      actions: {
        getSupportedAssets: () => {
          throw new Error('boom')
        },
      } as never,
    })
    await expect(runAssets()).rejects.toThrow('boom')
  })
})
