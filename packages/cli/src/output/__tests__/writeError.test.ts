import {
  ChainNotSupportedError,
  InvalidParamsError,
  ProviderNotConfiguredError,
} from '@eth-optimism/actions-sdk'
import { ContractFunctionRevertedError } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CliError, toCliError, writeError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

beforeEach(() => setJsonMode(true))
afterEach(() => setJsonMode(false))

const exitSpy = vi
  .spyOn(process, 'exit')
  .mockImplementation((() => undefined) as never)
const stderrSpy = vi
  .spyOn(process.stderr, 'write')
  .mockImplementation(() => true)

afterEach(() => {
  exitSpy.mockClear()
  stderrSpy.mockClear()
})

const capturedBody = (): Record<string, unknown> => {
  return JSON.parse(String(stderrSpy.mock.calls[0]?.[0]))
}

describe('writeError', () => {
  it('exits with the mapped exit code per CliError.code', () => {
    writeError(new CliError('validation', 'bad flag'))
    expect(exitSpy).toHaveBeenCalledWith(2)
    exitSpy.mockClear()
    stderrSpy.mockClear()

    writeError(new CliError('config', 'no env'))
    expect(exitSpy).toHaveBeenCalledWith(3)
    exitSpy.mockClear()
    stderrSpy.mockClear()

    writeError(new CliError('network', 'rpc'))
    expect(exitSpy).toHaveBeenCalledWith(4)
    exitSpy.mockClear()
    stderrSpy.mockClear()

    writeError(new CliError('onchain', 'revert'))
    expect(exitSpy).toHaveBeenCalledWith(5)
  })

  it('emits {error, code, retryable} for a CliError', () => {
    writeError(new CliError('network', 'rpc down'))
    const body = capturedBody()
    expect(body.error).toBe('rpc down')
    expect(body.code).toBe('network')
    expect(body.retryable).toBe(true)
  })

  it('includes retry_after_ms when set', () => {
    writeError(new CliError('network', 'rate limited', undefined, true, 1000))
    expect(capturedBody().retry_after_ms).toBe(1000)
  })

  it('coerces bigints in details to strings', () => {
    writeError(new CliError('onchain', 'revert', { amount: 1n }))
    expect(capturedBody()).toEqual(
      expect.objectContaining({
        details: { amount: '1' },
      }),
    )
  })

  it('redacts bundler URLs and signer metadata from details', () => {
    writeError(
      new CliError('network', 'failed', {
        bundlerUrl: 'https://api.pimlico.io/v2/8453/rpc?apikey=SECRET',
        signer: { address: '0xdead', publicKey: '0xcafe' },
      }),
    )
    const raw = JSON.stringify(capturedBody())
    expect(raw).not.toContain('SECRET')
    expect(raw).not.toContain('0xdead')
    expect(raw).not.toContain('0xcafe')
  })

  it('redacts RPC URLs from the top-level error message (json mode)', () => {
    writeError(
      new Error(
        'HTTP request failed. URL: https://api.pimlico.io/v2/8453/rpc?apikey=LEAKED',
      ),
    )
    const raw = JSON.stringify(capturedBody())
    expect(raw).not.toContain('LEAKED')
    expect(raw).not.toContain('pimlico.io')
    expect(raw).toContain('[redacted-url]')
  })

  it('redacts RPC URLs from the top-level error message (text mode)', () => {
    setJsonMode(false)
    writeError(
      new Error('fetch failed for https://eth.alchemyapi.io/v2/SECRETKEY/rpc'),
    )
    const text = String(stderrSpy.mock.calls[0]?.[0])
    expect(text).not.toContain('SECRETKEY')
    expect(text).not.toContain('alchemyapi.io')
    expect(text).toContain('[redacted-url]')
  })

  it('reports unknown code for non-CliError throws', () => {
    writeError(new Error('boom'))
    expect(exitSpy).toHaveBeenCalledWith(1)
    const body = capturedBody()
    expect(body.code).toBe('unknown')
    expect(body.retryable).toBe(false)
    expect(body.details).toBeUndefined()
  })

  it('terminates the body with a newline', () => {
    writeError(new CliError('validation', 'x'))
    const raw = stderrSpy.mock.calls[0]?.[0]
    const text = String(raw)
    expect(text.endsWith('\n')).toBe(true)
  })

  it('emits human-readable text when json mode is off', () => {
    setJsonMode(false)
    writeError(new CliError('config', 'no key'))
    const text = String(stderrSpy.mock.calls[0]?.[0])
    expect(text).toBe('Error (config): no key\n')
    expect(() => JSON.parse(text)).toThrow()
  })

  it('strips terminal control bytes from the text-mode error line', () => {
    // C0/C1 bytes can carry ANSI/OSC terminal controls in ENS text.
    setJsonMode(false)
    const malicious =
      'ENS name "evil\u001b[2J\u001b]0;pwned\u0007.eth" is invalid'
    writeError(new CliError('validation', malicious))
    const text = String(stderrSpy.mock.calls[0]?.[0])
    expect(text).not.toContain('\u001b')
    expect(text).not.toContain('\u0007')
    expect(text).toContain('evil')
    expect(text).toContain('.eth')
  })

  it('swallows EPIPE from the stderr write', () => {
    stderrSpy.mockImplementationOnce(() => {
      const e: NodeJS.ErrnoException = new Error('epipe')
      e.code = 'EPIPE'
      throw e
    })
    expect(() => writeError(new CliError('unknown', 'x'))).not.toThrow()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('rethrows non-EPIPE write failures', () => {
    stderrSpy.mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    expect(() => writeError(new CliError('unknown', 'x'))).toThrow('disk full')
  })
})

describe('toCliError', () => {
  it('passes existing CliError through unchanged', () => {
    const original = new CliError('validation', 'x')
    expect(toCliError(original)).toBe(original)
  })

  it('maps ProviderNotConfiguredError to code: config', () => {
    const err = toCliError(
      new ProviderNotConfiguredError({ provider: 'morpho' }),
    )
    expect(err.code).toBe('config')
    const details = err.details as { errorName: string; provider: string }
    expect(details.errorName).toBe('ProviderNotConfiguredError')
    expect(details.provider).toBe('morpho')
  })

  it('maps ChainNotSupportedError to code: validation with structured details', () => {
    const err = toCliError(
      new ChainNotSupportedError({
        chainId: 999,
        supportedChainIds: [10, 8453],
      }),
    )
    expect(err.code).toBe('validation')
    const details = err.details as {
      errorName: string
      chainId: number
      supportedChainIds: readonly number[]
    }
    expect(details.errorName).toBe('ChainNotSupportedError')
    expect(details.chainId).toBe(999)
    expect(details.supportedChainIds).toEqual([10, 8453])
  })

  it('maps InvalidParamsError to code: validation', () => {
    const err = toCliError(
      new InvalidParamsError({
        param: 'chainIds',
        expected: 'SupportedChainId[] (non-empty)',
        received: '[]',
      }),
    )
    expect(err.code).toBe('validation')
    const details = err.details as { param: string; expected: string }
    expect(details.param).toBe('chainIds')
    expect(details.expected).toContain('non-empty')
  })

  it('maps viem ContractFunctionRevertedError to code: onchain', () => {
    const revert = new ContractFunctionRevertedError({
      abi: [],
      data: undefined,
      functionName: 'supply',
    })
    const err = toCliError(revert)
    expect(err.code).toBe('onchain')
  })

  it('falls back to retryable network for unknown errors', () => {
    const err = toCliError(new Error('HTTP request failed: ECONNREFUSED'))
    expect(err.code).toBe('network')
    expect(err.retryable).toBe(true)
  })
})
