import { afterEach, describe, expect, it, vi } from 'vitest'

import { CliError, writeError } from '@/output/errors.js'

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
