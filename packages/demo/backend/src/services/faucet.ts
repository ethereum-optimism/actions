import { randomBytes } from 'node:crypto'

import type { Address, Hash, Hex, TypedDataDomain } from 'viem'
import {
  BaseError,
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  isHex,
  keccak256,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import { optimismSepolia } from 'viem/chains'

import { faucetAbi } from '@/abis/ethFaucet.js'
import { getActions } from '@/config/actions.js'
import { env } from '@/config/env.js'

type FaucetDripOutcome =
  | { status: 'success'; userOpHash: Hash }
  | { status: 'ineligible' }
  | { status: 'cooldown' }
  | { status: 'failed'; error?: unknown }

class FaucetConfigurationError extends BaseError {
  override name = 'FaucetConfigurationError' as const
  constructor(field: string) {
    super(`Invalid faucet configuration: ${field}`)
  }
}

/** Best-effort zero-balance pre-check; `reserveDrip` is the real cooldown gate. */
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

/** Synchronously claim a drip slot so concurrent requests for one wallet cannot all pass. */
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

/** Release a reservation after submission failure so the wallet can retry. */
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
 * @description Runs the complete ETH faucet workflow for a recipient.
 * @param recipient - Validated faucet recipient.
 * @returns A typed outcome for the HTTP controller.
 * @throws Never; expected failures are represented by the returned outcome.
 */
export async function executeFaucetDrip(
  recipient: Address,
): Promise<FaucetDripOutcome> {
  try {
    if (!(await isWalletEligibleForFaucet(recipient))) {
      return { status: 'ineligible' }
    }
    if (!reserveDrip(recipient)) return { status: 'cooldown' }
  } catch (error) {
    return { status: 'failed', error }
  }

  try {
    const result = await submitFaucetUserOperation(recipient)
    if (result.success) {
      return { status: 'success', userOpHash: result.userOpHash }
    }
  } catch (error) {
    releaseDrip(recipient)
    return { status: 'failed', error }
  }
  releaseDrip(recipient)
  return { status: 'failed' }
}

async function submitFaucetUserOperation(walletAddress: Address) {
  const id = keccak256(walletAddress)
  const faucetAuthModuleAddress = getAddress(env.AUTH_MODULE_ADDRESS)
  const adminSigner = getAdminSigner()
  const domain = {
    name: 'OffChainAuthModule',
    version: '1',
    chainId: optimismSepolia.id,
    verifyingContract: faucetAuthModuleAddress,
  }
  const nonce = generateNonce()
  const dripParams = { recipient: walletAddress, nonce, data: '0x' } as const
  const authParams = await createAuthParams(
    walletAddress,
    faucetAuthModuleAddress,
    id,
    nonce,
    domain,
    adminSigner,
  )

  const dripCallData = encodeFunctionData({
    abi: faucetAbi,
    functionName: 'drip',
    args: [dripParams, authParams],
  })
  const transactionData = [
    {
      to: getAddress(env.OP_SEPOLIA_FAUCET_ADDRESS),
      data: dripCallData,
      value: 0n,
    },
  ]
  const adminSmartWallet = await getActions().wallet.getSmartWallet({
    signer: adminSigner,
    deploymentSigners: [adminSigner],
  })

  return adminSmartWallet.sendBatch(transactionData, optimismSepolia.id)
}

function generateNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString('hex')}` // 256-bit CSPRNG
}

function getAdminSigner() {
  const privateKey = env.FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY
  if (!isHex(privateKey)) {
    throw new FaucetConfigurationError('FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY')
  }
  return privateKeyToAccount(privateKey)
}

async function createAuthParams(
  recipientAddress: Address,
  moduleAddress: Address,
  dripId: Hex,
  nonce: Hash,
  domain: TypedDataDomain,
  adminSigner: PrivateKeyAccount,
) {
  const proof = await adminSigner.signTypedData({
    domain,
    types: {
      Proof: [
        { name: 'recipient', type: 'address' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'id', type: 'bytes32' },
      ],
    },
    primaryType: 'Proof',
    message: { recipient: recipientAddress, nonce, id: dripId },
  })

  return {
    module: moduleAddress,
    id: dripId,
    proof,
  }
}
