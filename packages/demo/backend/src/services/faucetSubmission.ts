import { randomBytes } from 'node:crypto'

import type { Address, Hash, Hex, TypedDataDomain } from 'viem'
import {
  BaseError,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  isHex,
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

class FaucetConfigurationError extends BaseError {
  override name = 'FaucetConfigurationError' as const

  constructor(field: string) {
    super(`Invalid faucet configuration: ${field}`)
  }
}

/**
 * @description Submits an ETH faucet user operation authorized by the backend signer.
 * @param walletAddress - Validated faucet recipient.
 * @returns The submission status and user operation hash.
 * @throws When wallet construction, signing, or submission fails.
 */
export async function submitFaucetUserOperation(
  walletAddress: Address,
): Promise<{ success: boolean; userOpHash: Hash }> {
  const id = keccak256(walletAddress)
  const faucetAuthModuleAddress = getAddress(env.AUTH_MODULE_ADDRESS)
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
      to: getAddress(env.OP_SEPOLIA_FAUCET_ADDRESS),
      data: dripCallData,
      value: 0n,
    },
  ]

  const actions = getActions()
  const adminSigner = privateKeyToAccount(getAdminPrivateKey())
  const adminSmartWallet = await actions.wallet.getSmartWallet({
    signer: adminSigner,
    deploymentSigners: [adminSigner],
  })

  return adminSmartWallet.sendBatch(transactionData, optimismSepolia.id)
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

function getAdminPrivateKey(): Hex {
  const privateKey = env.FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY
  if (!isHex(privateKey)) {
    throw new FaucetConfigurationError('FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY')
  }
  return privateKey
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
    account: privateKeyToAccount(getAdminPrivateKey()),
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
