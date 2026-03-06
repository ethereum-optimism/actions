import type { Address, PublicClient } from 'viem'
import { encodeFunctionData, maxUint256 } from 'viem'

import type { TransactionData } from '@/types/transaction.js'

/** Default Permit2 approval expiry: 30 days in seconds */
export const DEFAULT_PERMIT2_EXPIRY_SECONDS = 30 * 24 * 60 * 60

/**
 * Permit2 ABI (subset for approvals)
 */
const PERMIT2_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
    ],
    outputs: [],
  },
] as const

/**
 * ERC20 approve ABI
 */
const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

/**
 * Permit2 allowance info
 */
export interface Permit2Allowance {
  amount: bigint
  expiration: number
  nonce: number
}

/**
 * Check Permit2 allowance for a token/spender pair
 */
export async function checkPermit2Allowance(params: {
  publicClient: PublicClient
  permit2Address: Address
  owner: Address
  token: Address
  spender: Address
}): Promise<Permit2Allowance> {
  const { publicClient, permit2Address, owner, token, spender } = params

  const result = await publicClient.readContract({
    address: permit2Address,
    abi: PERMIT2_ABI,
    functionName: 'allowance',
    args: [owner, token, spender],
  })

  return {
    amount: BigInt(result[0]),
    expiration: Number(result[1]),
    nonce: Number(result[2]),
  }
}

/**
 * Build token approval transaction to Permit2
 */
export function buildTokenApprovalTx(
  token: Address,
  permit2Address: Address,
): TransactionData {
  const data = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    // ERC20 -> Permit2: maxUint256 is the Uniswap-canonical pattern.
    // Permit2 is immutable with no owner — spending is scoped by its own allowance system.
    args: [permit2Address, maxUint256],
  })

  return {
    to: token,
    data,
    value: 0n,
  }
}

/**
 * Build Permit2 approval transaction for Universal Router
 */
export function buildPermit2ApprovalTx(params: {
  permit2Address: Address
  token: Address
  spender: Address
  amount: bigint
  expirySeconds?: number
}): TransactionData {
  const { permit2Address, token, spender, amount } = params
  const expiration =
    Math.floor(Date.now() / 1000) +
    (params.expirySeconds ?? DEFAULT_PERMIT2_EXPIRY_SECONDS)

  const data = encodeFunctionData({
    abi: PERMIT2_ABI,
    functionName: 'approve',
    args: [token, spender, amount, expiration],
  })

  return {
    to: permit2Address,
    data,
    value: 0n,
  }
}

/**
 * Check ERC20 token allowance
 */
export async function checkTokenAllowance(params: {
  publicClient: PublicClient
  token: Address
  owner: Address
  spender: Address
}): Promise<bigint> {
  const { publicClient, token, owner, spender } = params

  const allowance = await publicClient.readContract({
    address: token,
    abi: [
      {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
        ],
        outputs: [{ type: 'uint256' }],
      },
    ],
    functionName: 'allowance',
    args: [owner, spender],
  })
  return allowance
}
