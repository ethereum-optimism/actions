import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MOCK_ADDRESS,
  MOCK_ENS_INFO,
  MOCK_ENS_NAME,
} from '@/__tests__/helpers/ens.js'
import { setJsonMode } from '@/output/mode.js'
import { printOutput } from '@/output/printOutput.js'

// These formatters are only reached in human (text) mode; --json bypasses them.
beforeEach(() => setJsonMode(false))
afterEach(() => {
  setJsonMode(false)
  vi.restoreAllMocks()
})

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)

const capture = () => {
  const lines: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  })
  return lines
}

describe('ENS text formatters', () => {
  it('renders address as "name -> address"', () => {
    const lines = capture()
    printOutput('ensAddress', {
      name: MOCK_ENS_NAME,
      address: MOCK_ADDRESS,
    })
    expect(lines.join('')).toBe(`${MOCK_ENS_NAME} -> ${MOCK_ADDRESS}\n`)
  })

  it('renders name lookup with a name', () => {
    const lines = capture()
    printOutput('ensName', {
      address: MOCK_ADDRESS,
      name: MOCK_ENS_NAME,
    })
    expect(lines.join('')).toBe(`${MOCK_ADDRESS} -> ${MOCK_ENS_NAME}\n`)
  })

  it('renders the null-name branch of name lookup explicitly', () => {
    const lines = capture()
    printOutput('ensName', { address: MOCK_ADDRESS, name: null })
    expect(lines.join('')).toBe(`${MOCK_ADDRESS} -> (no primary ENS name)\n`)
  })

  it('renders the all-null profile branch of info', () => {
    const lines = capture()
    printOutput('ensInfo', MOCK_ENS_INFO)
    expect(lines.join('')).toBe('(no ENS profile records set)\n')
  })

  it('renders only the set records of a profile', () => {
    const lines = capture()
    printOutput('ensInfo', { ...MOCK_ENS_INFO, twitter: 'VitalikButerin' })
    const out = lines.join('')
    expect(out).toContain('twitter')
    expect(out).toContain('VitalikButerin')
    expect(out).not.toContain('avatar')
  })

  it('strips terminal control bytes from on-chain ENS text records', () => {
    const lines = capture()
    // ANSI clear-screen plus OSC title-rewrite around harmless text.
    const malicious = `${ESC}[2J${ESC}]0;pwned${BEL}evilplain`
    printOutput('ensInfo', { ...MOCK_ENS_INFO, description: malicious })
    const out = lines.join('')
    expect(out).not.toContain(ESC)
    expect(out).not.toContain(BEL)
    expect(out).toContain('evilplain')
  })

  it('strips control bytes from a reverse-resolved name', () => {
    const lines = capture()
    printOutput('ensName', {
      address: MOCK_ADDRESS,
      name: `evil${ESC}[31m.eth` as `${string}.${string}`,
    })
    expect(lines.join('')).not.toContain(ESC)
  })

  it('strips control bytes from a forward-resolved name', () => {
    // Forward output echoes the caller name, so sanitize it too.
    const lines = capture()
    printOutput('ensAddress', {
      name: `evil${ESC}[2J.eth` as `${string}.${string}`,
      address: MOCK_ADDRESS,
    })
    const out = lines.join('')
    expect(out).not.toContain(ESC)
    expect(out).toContain('evil')
    expect(out).toContain(MOCK_ADDRESS)
  })
})
