import { type ChildProcess, execFileSync, spawn } from 'node:child_process'

import { createPublicClient, http } from 'viem'

import type { ForkChainConfig } from '../fixtures/chains.js'
import { getRpcUrl } from '../fixtures/chains.js'

/**
 * Infer the client type through the same chain resolution path that
 * `createPublicClient({ chain: config.chain })` uses at runtime.
 * This avoids importing `PublicClient` directly, which triggers TS2719
 * because pnpm resolves two structurally-incompatible copies of viem
 * (same version, different zod peer-dep contexts).
 */
function createForkPublicClient(chain: ForkChainConfig['chain'], rpcUrl: string) {
  return createPublicClient({ chain, transport: http(rpcUrl) })
}

export type ForkClient = ReturnType<typeof createForkPublicClient>

export interface AnvilFork {
  port: number
  process: ChildProcess
  rpcUrl: string
  client: ForkClient
  config: ForkChainConfig
}

// Reuses an existing fork if one is already running on the requested port,
// so concurrent test suites that share a chain config don't spawn duplicate
// anvil processes.
const activeForks = new Map<number, AnvilFork>()

const RETRY_COUNT = 30
const RETRY_INTERVAL_MS = 500
const RETRY_WARN_THRESHOLD = 10

function assertAnvilInstalled(): void {
  try {
    execFileSync('anvil', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new Error(
      'anvil binary not found. Install Foundry first: https://getfoundry.sh',
    )
  }
}

export async function startFork(config: ForkChainConfig): Promise<AnvilFork> {
  if (activeForks.has(config.port)) {
    return activeForks.get(config.port)!
  }

  assertAnvilInstalled()

  const forkUrl = getRpcUrl(config)
  const proc = spawn(
    'anvil',
    ['--fork-url', forkUrl, '--port', String(config.port), '--silent'],
    { stdio: 'ignore' },
  )

  const rpcUrl = `http://127.0.0.1:${config.port}`

  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1,
        }),
      })
      if (res.ok) {
        const client = createForkPublicClient(config.chain, rpcUrl)
        const fork: AnvilFork = {
          port: config.port,
          process: proc,
          rpcUrl,
          client,
          config,
        }
        activeForks.set(config.port, fork)
        return fork
      }
    } catch {
      if (i === RETRY_WARN_THRESHOLD) {
        console.warn(
          `[forks] anvil on port ${config.port} not ready after ${i} retries, still waiting…`,
        )
      }
    }
    await new Promise((r) => setTimeout(r, RETRY_INTERVAL_MS))
  }

  proc.kill()
  throw new Error(
    `Anvil fork on port ${config.port} did not start within ${(RETRY_COUNT * RETRY_INTERVAL_MS) / 1000}s. ` +
      'Check that the upstream RPC is reachable and not rate-limited.',
  )
}

export function stopFork(fork: AnvilFork): void {
  fork.process.kill()
  activeForks.delete(fork.port)
}

export function stopAllForks(): void {
  for (const fork of activeForks.values()) {
    fork.process.kill()
  }
  activeForks.clear()
}

export async function snapshot(fork: AnvilFork): Promise<string> {
  const response = await fetch(fork.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_snapshot',
      params: [],
      id: 1,
    }),
  })
  const json = (await response.json()) as { result: string }
  return json.result
}

export async function revert(
  fork: AnvilFork,
  snapshotId: string,
): Promise<void> {
  await fetch(fork.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_revert',
      params: [snapshotId],
      id: 1,
    }),
  })
}

export async function increaseTime(
  fork: AnvilFork,
  seconds: number,
): Promise<void> {
  await fetch(fork.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [seconds],
      id: 1,
    }),
  })
  await fetch(fork.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'evm_mine',
      params: [],
      id: 1,
    }),
  })
}
