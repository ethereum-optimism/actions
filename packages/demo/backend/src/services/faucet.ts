import { randomBytes } from 'node:crypto'

import type { Address, Hash, Hex, TypedDataDomain } from 'viem'
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { optimismSepolia } from 'viem/chains'

import { faucetAbi } from '@/abis/ethFaucet.js'
import { getActions } from '@/config/actions.js'
import { env } from '@/config/env.js'

type DripParams = {
  recipient: Address
  nonce: Hash
  data: Hash
  gasLimit?: number
}

type AuthParams = {
  module: Address
  id: Hash
  proof: Hash
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

export async function dripEthToWallet(walletAddress: Address) {
  const id = keccak256(walletAddress)
  const faucetAuthModuleAddress = env.AUTH_MODULE_ADDRESS as Address
  const domain = {
    name: 'OffChainAuthModule',
    version: '1',
    chainId: optimismSepolia.id,
    verifyingContract: faucetAuthModuleAddress,
  }
  const nonce = generateNonce()

  const dripParams = createDripParams(walletAddress, nonce)
  const authParams = await createAuthParams(
    walletAddress,
    faucetAuthModuleAddress,
    id,
    nonce,
    domain,
  )

  const dripCallData = encodeFunctionData({
    abi: faucetAbi,
    functionName: 'drip',
    args: [dripParams, authParams],
  })
  const transactionData = [
    {
      to: env.OP_SEPOLIA_FAUCET_ADDRESS as Address,
      data: dripCallData,
      value: 0n,
    },
  ]

  const actions = getActions()
  const adminSigner = privateKeyToAccount(
    env.FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY as Hex,
  )
  const adminSmartWallet = await actions.wallet.getSmartWallet({
    signer: adminSigner,
    deploymentSigners: [adminSigner],
  })

  const receipt = await adminSmartWallet.sendBatch(
    transactionData,
    optimismSepolia.id,
  )
  return receipt
}

function createDripParams(recipientAddress: Address, nonce: Hash): DripParams {
  return {
    recipient: recipientAddress,
    nonce,
    data: '0x',
  }
}

function generateNonce(): `0x${string}` {
  return `0x${randomBytes(32).toString('hex')}` // 256-bit CSPRNG
}

async function createAuthParams(
  recipientAddress: Address,
  moduleAddress: Address,
  dripId: Hex,
  nonce: Hash,
  domain: TypedDataDomain,
): Promise<AuthParams> {
  const proof = {
    recipient: recipientAddress,
    nonce,
    id: dripId,
  }

  const adminWalletClient = createWalletClient({
    chain: optimismSepolia,
    transport: env.OP_SEPOLIA_RPC_URL ? http(env.OP_SEPOLIA_RPC_URL) : http(),
    account: privateKeyToAccount(
      env.FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY as Hex,
    ),
  })

  const types = {
    Proof: [
      { name: 'recipient', type: 'address' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'id', type: 'bytes32' },
    ],
  }
  const signature = await adminWalletClient.signTypedData({
    domain,
    types,
    primaryType: 'Proof',
    message: proof,
    account: adminWalletClient.account,
  })

  return {
    module: moduleAddress,
    id: dripId,
    proof: signature,
  }
}
