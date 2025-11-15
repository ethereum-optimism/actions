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

export async function isWalletEligibleForFaucet(
  walletAddress: Address,
): Promise<boolean> {
  console.log(`[FAUCET] Checking eligibility for wallet: ${walletAddress}`)
  const publicClient = createPublicClient({
    chain: optimismSepolia,
    transport: env.OP_SEPOLIA_RPC_URL ? http(env.OP_SEPOLIA_RPC_URL) : http(),
  })
  const balance = await publicClient.getBalance({ address: walletAddress })
  console.log(
    `[FAUCET] Wallet balance on OP Sepolia: ${balance} wei (${Number(balance) / 1e18} ETH)`,
  )
  if (balance > 0) {
    console.log(`[FAUCET] Wallet NOT eligible - already has balance`)
    return false
  }
  // TODO: When aave lending is implemented, check if the wallet already has a position open
  // and return false if it does.

  console.log(`[FAUCET] Wallet is eligible`)
  return true
}

export async function dripEthToWallet(walletAddress: Address) {
  console.log(`[FAUCET] Starting drip for wallet: ${walletAddress}`)

  const id = keccak256(walletAddress)
  const faucetAuthModuleAddress = env.AUTH_MODULE_ADDRESS as Address
  const domain = {
    name: 'OffChainAuthModule',
    version: '1',
    chainId: optimismSepolia.id,
    verifyingContract: faucetAuthModuleAddress,
  }
  const nonce = generateNonce()
  console.log(`[FAUCET] Generated nonce: ${nonce}`)

  const dripParams = createDripParams(walletAddress, nonce)
  console.log(`[FAUCET] Creating auth params`)
  const authParams = await createAuthParams(
    walletAddress,
    faucetAuthModuleAddress,
    id,
    nonce,
    domain,
  )
  console.log(`[FAUCET] Auth params created, encoding function data`)

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

  console.log(`[FAUCET] Getting admin smart wallet`)
  const actions = getActions()
  const adminSigner = privateKeyToAccount(
    env.FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY as Hex,
  )
  const adminSmartWallet = await actions.wallet.getSmartWallet({
    signer: adminSigner,
    deploymentSigners: [adminSigner],
  })
  console.log(`[FAUCET] Admin wallet address: ${adminSmartWallet.address}`)
  console.log(
    `[FAUCET] Sending batch transaction to faucet contract: ${env.OP_SEPOLIA_FAUCET_ADDRESS}`,
  )

  const receipt = await adminSmartWallet.sendBatch(
    transactionData,
    optimismSepolia.id,
  )
  console.log(
    `[FAUCET] Transaction complete, success: ${receipt.success}, userOpHash: ${receipt.userOpHash}`,
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
