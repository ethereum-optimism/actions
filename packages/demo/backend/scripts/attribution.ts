/*
  Purpose: Find transactions containing a 16-byte attribution suffix appended to ERC-4337 UserOperations.

  What it does:
  - Scans recent blocks for EntryPoint UserOperationEvent logs in CHUNK_SIZE windows.
  - Dedupes bundle transaction hashes (newest first), fetches each tx once, and decodes handleOps.
  - For each user operation, compares the last 16 bytes of callData and initCode to TARGET_SUFFIX.
  - Prints the first match (block, txHash, opIndex, sender) or reports none within BLOCKS_BACK.

  Config (env):
  - RPC_URL        JSON-RPC endpoint.
  - TARGET_SUFFIX  Required 16-byte hex (0x + 32 chars) to match.
  - BLOCKS_BACK    Max blocks to scan backwards (default 5000).
  - CHUNK_SIZE     Log query window size in blocks (default 1000).
  - ENTRYPOINT     EntryPoint address (hardcoded below for convenience).
*/

import 'dotenv/config'

import type { Address, GetTransactionReturnType, Hex } from 'viem'
import {
  createPublicClient,
  decodeFunctionData,
  http,
  parseAbiItem,
} from 'viem'
import { baseSepolia } from 'viem/chains'

import { entryPointAbi } from './entrypointAbi.js'

type DecodedUserOp = {
  sender: Address
  nonce: bigint
  initCode: Hex
  callData: Hex
  callGasLimit: bigint
  verificationGasLimit: bigint
  preVerificationGas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  paymasterAndData: Hex
  signature: Hex
}

const RPC_URL = process.env.RPC_URL
if (!RPC_URL) {
  throw new Error('RPC_URL is not set')
}
const BLOCKS_BACK = Number(process.env.BLOCKS_BACK ?? 5000)
const TARGET_SUFFIX: Hex = process.env.TARGET_SUFFIX as Hex
if (!TARGET_SUFFIX) {
  throw new Error('TARGET_SUFFIX is not set')
}
const ENTRYPOINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 1000)

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
})

function extract16ByteSuffix(hex: Hex): Hex | null {
  const raw = hex.slice(2)
  if (raw.length < 32) return null // need at least 16 bytes
  const suffix = `0x${raw.slice(-32)}` as Hex // last 16 bytes (32 hex chars)
  return /^0x[0-9a-fA-F]{32}$/.test(suffix) ? suffix : null
}

function findMatchingOpIndex(
  operations: readonly DecodedUserOp[],
  tx: GetTransactionReturnType<typeof baseSepolia>,
): boolean {
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]
    const callDataSuffix = extract16ByteSuffix(op.callData)
    const initCodeSuffix = extract16ByteSuffix(op.initCode)
    if (callDataSuffix === TARGET_SUFFIX || initCodeSuffix === TARGET_SUFFIX) {
      console.log(
        `MATCH block=${tx.blockNumber} tx=${tx.hash} opIndex=${i} sender=${op.sender}`,
      )
      return true
    }
  }
  return false
}

async function main() {
  const latest = await client.getBlockNumber()
  const from = latest - BigInt(BLOCKS_BACK)
  console.log(
    `Scanning logs ${from} -> ${latest} in ${CHUNK_SIZE}-block chunks for UserOperationEvent at ${ENTRYPOINT} (target suffix ${TARGET_SUFFIX})`,
  )

  let found = false

  for (
    let chunkEnd = latest;
    chunkEnd >= from && !found;
    chunkEnd -= BigInt(CHUNK_SIZE)
  ) {
    const tentativeStart = chunkEnd - BigInt(CHUNK_SIZE - 1)
    const chunkStart = tentativeStart > from ? tentativeStart : from
    const userOperationEvent =
      'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'

    const logs = await client.getLogs({
      address: ENTRYPOINT,
      event: parseAbiItem(userOperationEvent),
      fromBlock: chunkStart,
      toBlock: chunkEnd,
    })

    // Deduplicate tx hashes (newest-first) and iterate once
    const seen = new Set<string>()
    const uniqueTxs: Hex[] = []
    for (let idx = logs.length - 1; idx >= 0; idx--) {
      const h = logs[idx].transactionHash
      if (!h) continue
      if (!seen.has(h)) {
        seen.add(h)
        uniqueTxs.push(h)
      }
    }
    console.log(`Found ${uniqueTxs.length} unique txs`)

    for (const txHash of uniqueTxs) {
      if (found) break
      const tx = await client.getTransaction({ hash: txHash })

      const input = tx.input
      try {
        const decoded = decodeFunctionData({ abi: entryPointAbi, data: input })
        if (decoded.functionName !== 'handleOps') continue
        const [ops] = decoded.args

        if (findMatchingOpIndex(ops, tx)) {
          found = true
          break
        }
      } catch {
        continue
      }
    }
  }

  if (!found) {
    console.log('\nNo matches found in the specified block range.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
