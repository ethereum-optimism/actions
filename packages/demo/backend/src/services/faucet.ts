import type { Address, Hash } from 'viem'
import { createPublicClient, http } from 'viem'
import { optimismSepolia } from 'viem/chains'

import { env } from '@/config/env.js'
import { submitFaucetUserOperation } from '@/services/faucetSubmission.js'

export type FaucetDripOutcome =
  | { status: 'success'; userOpHash: Hash }
  | { status: 'ineligible' }
  | { status: 'cooldown' }
  | { status: 'failed'; error?: unknown }

/**
 * @description Performs a best-effort zero-balance pre-check before reservation.
 * @param walletAddress - Validated faucet recipient.
 * @returns Whether the wallet currently has no native ETH.
 */
export async function isWalletEligibleForFaucet(
  walletAddress: Address,
): Promise<boolean> {
  const publicClient = createPublicClient({
    chain: optimismSepolia,
    transport: env.OP_SEPOLIA_RPC_URL ? http(env.OP_SEPOLIA_RPC_URL) : http(),
  })
  const balance = await publicClient.getBalance({ address: walletAddress })
  return balance === 0n
}

/** Per-recipient cooldown state for this single-process demo backend. */
export const FAUCET_DRIP_COOLDOWN_MS = 24 * 60 * 60 * 1000
export const MAX_TRACKED_DRIP_RECIPIENTS = 10_000

const lastDripAtByRecipient = new Map<string, number>()

/**
 * @description Claims a cooldown slot before submitting a faucet drip.
 * @param walletAddress - Validated faucet recipient.
 * @param now - Current timestamp used for deterministic accounting.
 * @returns Whether the recipient acquired a drip reservation.
 */
export function reserveDrip(
  walletAddress: Address,
  now: number = Date.now(),
): boolean {
  const key = walletAddress.toLowerCase()
  sweepExpiredDripReservations(now)
  const lastDripAt = lastDripAtByRecipient.get(key)
  if (lastDripAt !== undefined && now - lastDripAt < FAUCET_DRIP_COOLDOWN_MS) {
    return false
  }
  if (
    lastDripAt === undefined &&
    lastDripAtByRecipient.size >= MAX_TRACKED_DRIP_RECIPIENTS
  ) {
    return false
  }
  lastDripAtByRecipient.set(key, now)
  return true
}

/**
 * @description Releases a failed drip reservation so the recipient can retry.
 * @param walletAddress - Validated faucet recipient.
 * @returns Nothing.
 */
export function releaseDrip(walletAddress: Address): void {
  lastDripAtByRecipient.delete(walletAddress.toLowerCase())
}

function sweepExpiredDripReservations(now: number): void {
  for (const [key, lastDripAt] of lastDripAtByRecipient) {
    if (now - lastDripAt >= FAUCET_DRIP_COOLDOWN_MS) {
      lastDripAtByRecipient.delete(key)
    }
  }
}

/**
 * @description Executes faucet eligibility, reservation, submission, and rollback.
 * @param recipient - Validated faucet recipient.
 * @returns A typed outcome for HTTP response mapping.
 */
export async function executeFaucetDrip(
  recipient: Address,
): Promise<FaucetDripOutcome> {
  try {
    const eligible = await isWalletEligibleForFaucet(recipient)
    if (!eligible) return { status: 'ineligible' }
    if (!reserveDrip(recipient)) return { status: 'cooldown' }
    return sendReservedDrip(recipient)
  } catch (error) {
    return { status: 'failed', error }
  }
}

async function sendReservedDrip(
  recipient: Address,
): Promise<FaucetDripOutcome> {
  try {
    const result = await submitFaucetUserOperation(recipient)
    if (result.success) {
      return { status: 'success', userOpHash: result.userOpHash }
    }
    releaseDrip(recipient)
    return { status: 'failed' }
  } catch (error) {
    releaseDrip(recipient)
    return { status: 'failed', error }
  }
}
