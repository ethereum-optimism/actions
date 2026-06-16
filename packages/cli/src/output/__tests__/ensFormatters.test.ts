import type { EnsInfo } from '@eth-optimism/actions-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setJsonMode } from '@/output/mode.js'
import { printOutput } from '@/output/printOutput.js'

// These formatters are only reached in human (text) mode; --json bypasses them.
beforeEach(() => setJsonMode(false))
afterEach(() => {
  setJsonMode(false)
  vi.restoreAllMocks()
})

const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)

const NULL_INFO: EnsInfo = {
  avatar: null,
  display: null,
  description: null,
  url: null,
  email: null,
  keywords: null,
  twitter: null,
  github: null,
  discord: null,
  reddit: null,
}

const capture = () => {
  const lines: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  })
  return lines
}

describe('ENS text formatters', () => {
  it('renders resolve as "name -> address"', () => {
    const lines = capture()
    printOutput('ensResolve', { name: 'vitalik.eth', address: VITALIK })
    expect(lines.join('')).toBe(`vitalik.eth -> ${VITALIK}\n`)
  })

  it('renders reverse with a name', () => {
    const lines = capture()
    printOutput('ensReverse', { address: VITALIK, name: 'vitalik.eth' })
    expect(lines.join('')).toBe(`${VITALIK} -> vitalik.eth\n`)
  })

  it('renders the null-name branch of reverse explicitly', () => {
    const lines = capture()
    printOutput('ensReverse', { address: VITALIK, name: null })
    expect(lines.join('')).toBe(`${VITALIK} -> (no primary ENS name)\n`)
  })

  it('renders the all-null profile branch of info', () => {
    const lines = capture()
    printOutput('ensInfo', NULL_INFO)
    expect(lines.join('')).toBe('(no ENS profile records set)\n')
  })

  it('renders only the set records of a profile', () => {
    const lines = capture()
    printOutput('ensInfo', { ...NULL_INFO, twitter: 'VitalikButerin' })
    const out = lines.join('')
    expect(out).toContain('twitter')
    expect(out).toContain('VitalikButerin')
    expect(out).not.toContain('avatar')
  })

  it('strips terminal control bytes from on-chain ENS text records', () => {
    const lines = capture()
    // A malicious profile record carrying an ANSI clear-screen escape and an
    // OSC title-rewrite sequence wrapped around innocuous-looking text.
    const malicious = `${ESC}[2J${ESC}]0;pwned${BEL}evilplain`
    printOutput('ensInfo', { ...NULL_INFO, description: malicious })
    const out = lines.join('')
    expect(out).not.toContain(ESC)
    expect(out).not.toContain(BEL)
    expect(out).toContain('evilplain')
  })

  it('strips control bytes from a reverse-resolved name', () => {
    const lines = capture()
    printOutput('ensReverse', {
      address: VITALIK,
      name: `evil${ESC}[31m.eth` as `${string}.${string}`,
    })
    expect(lines.join('')).not.toContain(ESC)
  })
})
