import { BaseError } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  CliError,
  exitCodeFor,
  retryableDefaultFor,
  safeDetails,
} from '@/output/errors.js'

class FakeHttpRequestError extends BaseError {
  override name = 'HttpRequestError'
}

describe('CliError', () => {
  it('defaults retryability by code', () => {
    expect(new CliError('network', 'rpc').retryable).toBe(true)
    expect(new CliError('config', 'missing').retryable).toBe(false)
    expect(new CliError('onchain', 'revert').retryable).toBe(false)
  })

  it('honours retryableOverride', () => {
    expect(new CliError('onchain', 'nonce', undefined, true).retryable).toBe(
      true,
    )
    expect(new CliError('network', 'x', undefined, false).retryable).toBe(false)
  })

  it('preserves retryAfterMs', () => {
    expect(
      new CliError('network', 'x', undefined, undefined, 1500).retryAfterMs,
    ).toBe(1500)
  })
})

describe('exitCodeFor', () => {
  it('maps every code to a distinct exit value', () => {
    const codes = [
      'unknown',
      'validation',
      'config',
      'network',
      'onchain',
    ] as const
    const values = codes.map(exitCodeFor)
    expect(new Set(values).size).toBe(codes.length)
    expect(exitCodeFor('validation')).toBe(2)
    expect(exitCodeFor('network')).toBe(4)
  })
})

describe('retryableDefaultFor', () => {
  it('only flags network as retryable by default', () => {
    expect(retryableDefaultFor('network')).toBe(true)
    expect(retryableDefaultFor('unknown')).toBe(false)
    expect(retryableDefaultFor('validation')).toBe(false)
    expect(retryableDefaultFor('config')).toBe(false)
    expect(retryableDefaultFor('onchain')).toBe(false)
  })
})

describe('safeDetails', () => {
  it('returns undefined for undefined input', () => {
    expect(safeDetails(undefined)).toBeUndefined()
  })

  it('replaces bundler URLs with a redaction marker', () => {
    const url = 'https://api.pimlico.io/v2/8453/rpc?apikey=SECRET'
    const out = safeDetails({ bundlerUrl: url }) as { bundlerUrl: string }
    expect(out.bundlerUrl).toBe('[redacted-url]')
  })

  it('replaces URLs nested in arrays without touching plain strings', () => {
    const out = safeDetails({
      urls: ['https://api.pimlico.io/v2/8453/rpc?apikey=SECRET', 'plain'],
    }) as { urls: string[] }
    expect(out.urls[0]).toBe('[redacted-url]')
    expect(out.urls[1]).toBe('plain')
  })

  it('redacts URLs embedded inside a longer string', () => {
    const out = safeDetails({
      shortMessage:
        'HTTP request failed. URL: https://api.pimlico.io/v2/8453/rpc?apikey=SECRET',
    }) as { shortMessage: string }
    expect(out.shortMessage).toBe('HTTP request failed. URL: [redacted-url]')
  })

  it('reduces viem BaseError instances to errorName + shortMessage', () => {
    const viemErr = new FakeHttpRequestError(
      'HTTP request failed. URL: https://api.pimlico.io/v2/8453/rpc?apikey=SECRET',
      {
        details: 'verbose dump with headers and bodies',
        metaMessages: ['Bearer SECRET'],
      },
    )
    const out = safeDetails({ cause: viemErr }) as {
      cause: { errorName: string; shortMessage: string }
    }
    expect(out.cause.errorName).toBe('HttpRequestError')
    expect(out.cause.shortMessage).toContain('[redacted-url]')
    expect(JSON.stringify(out)).not.toContain('SECRET')
  })

  it('drops signer publicKey and address metadata', () => {
    const out = safeDetails({
      signer: {
        address: '0xdeadbeef',
        publicKey: '0x0400aabbcc',
        source: 'privateKey',
      },
      address: '0xcafebabe',
      chainId: 84532,
    }) as Record<string, unknown>
    expect(out.signer).toBeUndefined()
    expect(out.address).toBeUndefined()
    expect(out.chainId).toBe(84532)
  })

  it('preserves allowlisted scalars and primitive shapes', () => {
    const out = safeDetails({
      errorName: 'UserOperationRevertedError',
      shortMessage: 'revert',
      chainId: 84532,
      status: 'reverted',
      unknownScalar: 'drop-me',
      nestedOk: { errorName: 'Inner', shortMessage: 'inner' },
    }) as Record<string, unknown>
    expect(out.errorName).toBe('UserOperationRevertedError')
    expect(out.chainId).toBe(84532)
    expect(out.unknownScalar).toBe('drop-me') // plain strings pass (stripped)
    expect(out.nestedOk).toEqual({ errorName: 'Inner', shortMessage: 'inner' })
  })

  it('preserves bigint values for later coercion', () => {
    const out = safeDetails({ amount: 1n }) as { amount: bigint }
    expect(out.amount).toBe(1n)
  })
})
