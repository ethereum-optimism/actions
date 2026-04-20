import type { Address, PublicClient } from 'viem'
import { encodeFunctionData, erc20Abi, maxUint256 } from 'viem'

import type { TransactionData } from '@/types/transaction.js'
import { PERMIT2_ABI } from '@/utils/abi/permit2.js'

/** Default Permit2 approval expiry: 30 days in seconds */
export const DEFAULT_PERMIT2_EXPIRY_SECONDS = 30 * 24 * 60 * 60

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
 * Build ERC20 token approval transaction to Permit2.
 * Uses maxUint256 — the Uniswap-canonical pattern.
 * Permit2 is immutable with no owner; spending is scoped by its own allowance system.
 */
export function buildTokenApprovalTx(
  token: Address,
  permit2Address: Address,
): TransactionData {
  return buildErc20ApprovalTx(token, permit2Address, maxUint256)
}

/**
 * Build Permit2 approval transaction for a spender
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

  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic ERC20 approval utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an ERC20 approve transaction.
 * @param token - ERC20 token address
 * @param spender - Address to approve
 * @param amount - Amount to approve
 * @returns Transaction data for the approval
 */
export function buildErc20ApprovalTx(
  token: Address,
  spender: Address,
  amount: bigint,
): TransactionData {
  return {
    to: token,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    }),
    value: 0n,
  }
}

/**
 * Compute how much additional ERC20 approval is needed.
 * Returns 0n if current allowance is sufficient.
 * @param params - Token, owner, spender, required amount, and public client
 * @returns The deficit (required - current), or 0n if already sufficient
 */
export async function getApprovalDeficit(params: {
  publicClient: PublicClient
  token: Address
  owner: Address
  spender: Address
  amount: bigint
}): Promise<bigint> {
  const current = await checkTokenAllowance(params)
  return current >= params.amount ? 0n : params.amount - current
}

/**
 * Build an ERC20 approval transaction only if needed, approving only the deficit.
 * Checks the current on-chain allowance, returns undefined if already sufficient.
 * @param params - Token, owner, spender, required amount, and public client
 * @returns Approval transaction for the deficit amount, or undefined if allowance is sufficient
 */
export async function buildApprovalTxIfNeeded(params: {
  publicClient: PublicClient
  token: Address
  owner: Address
  spender: Address
  amount: bigint
}): Promise<TransactionData | undefined> {
  const deficit = await getApprovalDeficit(params)
  return deficit > 0n
    ? buildErc20ApprovalTx(params.token, params.spender, deficit)
    : undefined
}
