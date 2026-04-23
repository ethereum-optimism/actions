import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { beforeAll, describe, expect, it } from 'vitest'

const execFileP = promisify(execFile)

const ANVIL_ACCOUNT_0 =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

const HERE = dirname(fileURLToPath(import.meta.url))
const BIN = resolve(HERE, '../../dist/index.js')

async function run(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileP('node', [BIN, ...args], {
      env: { ...process.env, ...env },
    })
    return { stdout, stderr, code: 0 }
  } catch (err) {
    const e = err as {
      stdout?: string
      stderr?: string
      code?: number
    }
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: typeof e.code === 'number' ? e.code : 1,
    }
  }
}

const ANSI_PATTERN = /\x1b\[[0-9;]*m/

describe('actions CLI (built binary)', () => {
  beforeAll(() => {
    if (!existsSync(BIN)) {
      throw new Error(
        `dist/index.js not found at ${BIN}. Run pnpm -C packages/cli build first.`,
      )
    }
  })

  describe('actions --help', () => {
    it('exits 0 with no env vars set', async () => {
      const { stdout, stderr, code } = await run(['--help'], {
        PRIVATE_KEY: '',
      })
      expect(code).toBe(0)
      expect(stderr).toBe('')
      expect(stdout).toContain('actions')
      expect(stdout).toContain('wallet')
    })
  })

  describe('actions assets', () => {
    it('emits JSON, exits 0, no ANSI on stdout', async () => {
      const { stdout, stderr, code } = await run(['assets'])
      expect(code).toBe(0)
      expect(stderr).toBe('')
      expect(stdout).not.toMatch(ANSI_PATTERN)
      const body = JSON.parse(stdout)
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
    })
  })

  describe('actions chains', () => {
    it('emits JSON array with chainId + shortname per chain', async () => {
      const { stdout, code } = await run(['chains'])
      expect(code).toBe(0)
      const body = JSON.parse(stdout) as Array<{
        chainId: number
        shortname: string
      }>
      expect(body.length).toBeGreaterThan(0)
      for (const entry of body) {
        expect(typeof entry.chainId).toBe('number')
        expect(typeof entry.shortname).toBe('string')
      }
    })
  })

  describe('actions wallet address', () => {
    it('missing PRIVATE_KEY -> stderr JSON code:config exit 3', async () => {
      const { stdout, stderr, code } = await run(['wallet', 'address'], {
        PRIVATE_KEY: '',
      })
      expect(code).toBe(3)
      expect(stdout).toBe('')
      const body = JSON.parse(stderr)
      expect(body.code).toBe('config')
      expect(body.retryable).toBe(false)
    })

    it('happy path with ANVIL_ACCOUNT_0 returns deterministic address', async () => {
      const { stdout, code } = await run(['wallet', 'address'], {
        PRIVATE_KEY: ANVIL_ACCOUNT_0,
      })
      expect(code).toBe(0)
      expect(stdout).not.toMatch(ANSI_PATTERN)
      const body = JSON.parse(stdout) as { address: string }
      expect(body.address.toLowerCase()).toBe(
        '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'.toLowerCase(),
      )
    })
  })

  describe('actions wallet balance', () => {
    it('blackhole RPC -> stderr JSON code:network retryable:true exit 4', async () => {
      const { stderr, code } = await run(['wallet', 'balance'], {
        PRIVATE_KEY: ANVIL_ACCOUNT_0,
        BASE_SEPOLIA_RPC_URL: 'http://127.0.0.1:1',
        OP_SEPOLIA_RPC_URL: 'http://127.0.0.1:1',
        UNICHAIN_RPC_URL: 'http://127.0.0.1:1',
      })
      expect(code).toBe(4)
      const body = JSON.parse(stderr)
      expect(body.code).toBe('network')
      expect(body.retryable).toBe(true)
    }, 30_000)
  })

  describe('wallet balance --chain flags', () => {
    it('rejects both --chain and --chain-id with code:validation exit 2', async () => {
      const { stdout, stderr, code } = await run(
        ['wallet', 'balance', '--chain', 'base-sepolia', '--chain-id', '84532'],
        { PRIVATE_KEY: ANVIL_ACCOUNT_0 },
      )
      expect(code).toBe(2)
      expect(stdout).toBe('')
      const body = JSON.parse(stderr)
      expect(body.code).toBe('validation')
      expect(body.error).toMatch(/not both/)
    })

    it('rejects unknown --chain-id with code:validation exit 2', async () => {
      const { stderr, code } = await run(
        ['wallet', 'balance', '--chain-id', '999999999'],
        { PRIVATE_KEY: ANVIL_ACCOUNT_0 },
      )
      expect(code).toBe(2)
      const body = JSON.parse(stderr)
      expect(body.code).toBe('validation')
    })
  })

  describe('unknown command', () => {
    it('exits 1 with commander plain-text stderr (not writeError JSON)', async () => {
      const { stdout, stderr, code } = await run(['nonsense-command'])
      expect(code).toBe(1)
      expect(stdout).toBe('')
      expect(stderr).toContain('unknown command')
      expect(() => JSON.parse(stderr)).toThrow()
    })
  })
})
