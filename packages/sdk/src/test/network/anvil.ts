/**
 * Anvil fork lifecycle helpers for network tests.
 *
 * The single fork-harness entry point. Allocates an OS-assigned ephemeral
 * port (no hard-coded port literals, which makes `EADDRINUSE` collisions
 * between concurrent fork suites vanishingly unlikely rather than guaranteed
 * by manual bookkeeping) and validates the fork's `eth_chainId` against the
 * expected chain before declaring the node ready. A bare HTTP 200 from an
 * unforked or wrong-chain node fails loudly instead of passing.
 */
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

/**
 * Running Anvil fork process.
 * @description Used by network tests that need a local fork of a public RPC.
 */
export interface AnvilFork {
  /** OS-assigned local port the Anvil JSON-RPC server is bound to. */
  port: number
  /** Spawned Anvil child process. */
  process: ChildProcess
  /** Local JSON-RPC URL for the fork. */
  rpcUrl: string
  /** `eth_chainId` reported by the fork, validated at startup. */
  chainId: number
}

/**
 * Allocate a free TCP port from the OS.
 * @description Asks the OS for an available local port for a short-lived fork.
 * @returns A port number that was free at allocation time.
 */
async function allocateEphemeralPort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const { port } = address
        server.close(() => resolve(port))
      } else {
        server.close(() =>
          reject(new Error('Failed to allocate an ephemeral port')),
        )
      }
    })
  })
}

/**
 * Probe a node's `eth_chainId`.
 * @description Reads and validates a JSON-RPC `eth_chainId` response.
 * @param rpcUrl - JSON-RPC URL to probe.
 * @returns The numeric chain id, or null when the node is not ready or the
 * response is not a valid JSON-RPC result.
 */
async function probeChainId(rpcUrl: string): Promise<number | null> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1,
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result?: unknown }
    // Treat any non-hex result as "not ready".
    if (typeof json.result !== 'string') return null
    const chainId = Number.parseInt(json.result, 16)
    return Number.isInteger(chainId) && chainId > 0 ? chainId : null
  } catch {
    // Anvil is still starting, or the URL is unreachable.
    return null
  }
}

/**
 * Start an Anvil fork on an ephemeral port and wait until it serves the
 * expected chain.
 * @description Starts a local Anvil fork and validates its chain before use.
 * @param forkUrl - Upstream RPC URL to fork.
 * @param expectedChainId - Chain id the fork must report from `eth_chainId`.
 * @returns Fork metadata including process handle, bound port, and local RPC URL.
 * @throws Error when the fork does not become ready in time, or reports a
 * chain id other than `expectedChainId` (wrong fork URL / unforked node).
 */
export async function startAnvilFork(
  forkUrl: string,
  expectedChainId: number,
): Promise<AnvilFork> {
  const port = await allocateEphemeralPort()
  const proc = spawn(
    'anvil',
    ['--fork-url', forkUrl, '--port', String(port), '--silent'],
    { stdio: 'ignore' },
  )

  // Surface spawn failures and early exits instead of a generic readiness timeout.
  let spawnFailure: Error | null = null
  proc.on('error', (err) => {
    spawnFailure = new Error(`Failed to spawn anvil: ${err.message}`)
  })
  proc.on('exit', (code, signal) => {
    if (spawnFailure === null && signal === null) {
      spawnFailure = new Error(
        `anvil on port ${port} exited early with code ${code}`,
      )
    }
  })

  const rpcUrl = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) {
    if (spawnFailure !== null) {
      proc.kill()
      throw spawnFailure
    }
    const chainId = await probeChainId(rpcUrl)
    if (chainId !== null) {
      if (chainId !== expectedChainId) {
        proc.kill()
        throw new Error(
          `Anvil fork on port ${port} reports chainId ${chainId}, expected ${expectedChainId}`,
        )
      }
      return { port, process: proc, rpcUrl, chainId }
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  proc.kill()
  throw new Error(`Anvil fork on port ${port} did not start in time`)
}

/**
 * Stop a running Anvil fork process.
 * @description Terminates the child process for a fork created by this harness.
 * @param fork - Fork process returned by `startAnvilFork`.
 * @returns Nothing.
 */
export function stopAnvilFork(fork: AnvilFork): void {
  fork.process.kill()
}
