import type { Context, Next } from 'hono'
import type { Address, Hex } from 'viem'
import { isAddressEqual, isHex, size, verifyMessage } from 'viem'
import { optimismSepolia } from 'viem/chains'
import { z } from 'zod'

import { getActions } from '@/config/actions.js'
import { errorResponse } from '@/helpers/errors.js'
import { AddressSchema } from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'

const MAX_PROOF_AGE_MS = 5 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 30 * 1000

const SignatureSchema = z.custom<Hex>(
  (value) => isHex(value, { strict: true }) && size(value) === 65,
  'Invalid signature format',
)

const FrontendWalletProofRequestSchema = z.object({
  body: z.strictObject({
    ownerAddress: AddressSchema,
    walletAddress: AddressSchema,
    issuedAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    signature: SignatureSchema,
  }),
})

type FrontendWalletProof = z.infer<
  typeof FrontendWalletProofRequestSchema
>['body']

export interface FrontendWalletAuthContext {
  recipient: Address
  rateLimitKey: string
}

export type FrontendWalletProofEnv = {
  Variables: { frontendWalletAuth: FrontendWalletAuthContext }
}

/**
 * @description Builds the canonical message signed by frontend wallet owners.
 * @param proof - Wallet owner, smart-wallet recipient, and issuance timestamp.
 * @returns The chain-bound EIP-191 message.
 */
export function buildFrontendWalletProofMessage(
  proof: Pick<
    FrontendWalletProof,
    'issuedAt' | 'ownerAddress' | 'walletAddress'
  >,
) {
  return [
    'actions-demo:eth-faucet:v1',
    `chainId=${optimismSepolia.id}`,
    `owner=${proof.ownerAddress.toLowerCase()}`,
    `wallet=${proof.walletAddress.toLowerCase()}`,
    `issuedAt=${proof.issuedAt}`,
  ].join('\n')
}

function isFreshProof(issuedAt: number, now = Date.now()) {
  return (
    issuedAt >= now - MAX_PROOF_AGE_MS && issuedAt <= now + MAX_FUTURE_SKEW_MS
  )
}

async function hasValidSignature(proof: FrontendWalletProof) {
  try {
    return await verifyMessage({
      address: proof.ownerAddress,
      message: buildFrontendWalletProofMessage(proof),
      signature: proof.signature,
    })
  } catch {
    return false
  }
}

async function deriveSmartWalletAddress(ownerAddress: Address) {
  const provider = await getActions().wallet.smartWalletProvider()
  return provider.getWalletAddress({ signers: [ownerAddress], nonce: 0n })
}

async function verifyProof(
  proof: FrontendWalletProof,
): Promise<FrontendWalletAuthContext | null> {
  if (!isFreshProof(proof.issuedAt) || !(await hasValidSignature(proof))) {
    return null
  }
  const expectedWallet = await deriveSmartWalletAddress(proof.ownerAddress)
  if (!isAddressEqual(expectedWallet, proof.walletAddress)) return null
  return {
    recipient: expectedWallet,
    rateLimitKey: `frontend-owner:${proof.ownerAddress.toLowerCase()}`,
  }
}

/**
 * @description Authenticates a short-lived proof from a frontend wallet owner.
 * @param c - Hono request context.
 * @param next - Next route handler.
 * @returns A response for invalid proofs, otherwise the next handler result.
 */
export async function frontendWalletProofMiddleware(
  c: Context<FrontendWalletProofEnv>,
  next: Next,
) {
  const validation = await validateRequest(c, FrontendWalletProofRequestSchema)
  if (!validation.success) return validation.response

  try {
    const auth = await verifyProof(validation.data.body)
    if (!auth) return errorResponse(c, 'Invalid wallet proof', 401)
    c.set('frontendWalletAuth', auth)
    await next()
  } catch (error) {
    return errorResponse(c, 'Failed to verify wallet proof', 500, error)
  }
}

/**
 * @description Reads the owner proof established by the faucet middleware.
 * @param c - Hono request context.
 * @returns The verified recipient and rate-limit identity, when available.
 */
export function getFrontendWalletAuth(
  c: Context<FrontendWalletProofEnv>,
): FrontendWalletAuthContext | undefined {
  return c.get('frontendWalletAuth')
}
