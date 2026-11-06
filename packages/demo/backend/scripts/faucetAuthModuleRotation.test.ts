import { type ChildProcess, execFileSync, spawn } from 'node:child_process'

import {
  type Address,
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  parseAbi,
  parseEther,
  zeroAddress,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { optimismSepolia } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { faucetAbi } from '../src/abis/ethFaucet.js'
import {
  faucetModuleAbi,
  loadCreationCode,
  rotateAuthModule,
} from './faucetAuthModuleRotation.js'

const FAUCET: Address = '0xAe23F412d318Ceb3E91De8FA57e8728a30733CAE'
const OLD_MODULE: Address = '0x23C86891F94A92DB3f4cE292aF6dA1b4e5330A00'
const FAUCET_ADMIN: Address = '0xA12352B7FF61BF85884c6fcB32d0E0fdA23bFC66'
const OTHER_ACCOUNT: Address = '0x000000000000000000000000000000000000dEaD'
const FORK_URL =
  process.env.FORK_RPC_URL ?? 'https://optimism-sepolia-rpc.publicnode.com'
const PORT = 18545
const RPC = `http://127.0.0.1:${PORT}`

// The fork test needs anvil and a public RPC, so it only runs on request:
// RUN_FORK_TESTS=1 pnpm vitest --run scripts/faucetAuthModuleRotation.test.ts
const runForkTests = (() => {
  if (!process.env.RUN_FORK_TESTS) return false
  try {
    execFileSync('anvil', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

describe.skipIf(!runForkTests)('rotateAuthModule on an OP Sepolia fork', () => {
  let anvil: ChildProcess
  const publicClient = createPublicClient({ transport: http(RPC) })
  const testClient = createTestClient({
    chain: optimismSepolia,
    mode: 'anvil',
    transport: http(RPC),
  })

  const impersonate = (address: Address) =>
    createWalletClient({
      account: address,
      chain: optimismSepolia,
      transport: http(RPC),
    })

  const run = (caller: Address, newSigner: Address, logs: string[]) =>
    rotateAuthModule({
      publicClient,
      walletClient: impersonate(caller),
      faucet: FAUCET,
      oldModule: OLD_MODULE,
      newSigner,
      creationCode: loadCreationCode(),
      pause: async () => {},
      log: (line) => logs.push(line),
    })

  beforeAll(async () => {
    anvil = spawn('anvil', ['--fork-url', FORK_URL, '--port', String(PORT)], {
      stdio: 'ignore',
    })
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await publicClient.getChainId()
        break
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    // Spoof the faucet admin and a stranger: no private keys involved.
    for (const address of [FAUCET_ADMIN, OTHER_ACCOUNT]) {
      await testClient.impersonateAccount({ address })
      await testClient.setBalance({ address, value: parseEther('1') })
    }
  }, 60_000)

  afterAll(() => {
    anvil?.kill()
  })

  const newSignerKey = generatePrivateKey()
  const newSignerAccount = privateKeyToAccount(newSignerKey)

  it('refuses a caller that is not the faucet admin', async () => {
    await expect(
      run(OTHER_ACCOUNT, newSignerAccount.address, []),
    ).rejects.toThrow(/faucet ADMIN/)
  })

  it('refuses the zero address and the old module signer', async () => {
    const oldSigner = await publicClient.readContract({
      address: OLD_MODULE,
      abi: parseAbi(['function ADMIN() view returns (address)']),
      functionName: 'ADMIN',
    })

    await expect(run(FAUCET_ADMIN, zeroAddress, [])).rejects.toThrow(/zero/)
    await expect(run(FAUCET_ADMIN, oldSigner, [])).rejects.toThrow(
      /same as the old/,
    )
  })

  it('swaps modules, copies the config, accepts new-signer drips and logs no keys', async () => {
    const logs: string[] = []
    const [, , oldTtl, oldAmount] = await publicClient.readContract({
      address: FAUCET,
      abi: faucetModuleAbi,
      functionName: 'modules',
      args: [OLD_MODULE],
    })

    const { newModule } = await run(
      FAUCET_ADMIN,
      newSignerAccount.address,
      logs,
    )

    const [, oldEnabled] = await publicClient.readContract({
      address: FAUCET,
      abi: faucetModuleAbi,
      functionName: 'modules',
      args: [OLD_MODULE],
    })
    const [name, newEnabled, ttl, amount] = await publicClient.readContract({
      address: FAUCET,
      abi: faucetModuleAbi,
      functionName: 'modules',
      args: [newModule],
    })
    expect(oldEnabled).toBe(false)
    expect(newEnabled).toBe(true)
    expect([ttl, amount]).toEqual([oldTtl, oldAmount])
    expect(name).toBe('OffChainAuthModule')

    // Sign exactly like services/faucet.ts and drip to a fresh recipient.
    const signer = newSignerAccount
    const recipient: Address = '0x00000000000000000000000000000000000b0b01'
    const id = keccak256(recipient)
    const nonce = keccak256('0x01')
    const proof = await signer.signTypedData({
      domain: {
        name: 'OffChainAuthModule',
        version: '1',
        chainId: optimismSepolia.id,
        verifyingContract: newModule,
      },
      types: {
        Proof: [
          { name: 'recipient', type: 'address' },
          { name: 'nonce', type: 'bytes32' },
          { name: 'id', type: 'bytes32' },
        ],
      },
      primaryType: 'Proof',
      message: { recipient, nonce, id },
    })
    const drip = (module: Address) =>
      impersonate(OTHER_ACCOUNT).writeContract({
        chain: optimismSepolia,
        address: FAUCET,
        abi: faucetAbi,
        functionName: 'drip',
        args: [
          { recipient, data: '0x', nonce },
          { module, id, proof },
        ],
      })

    await drip(newModule)
    expect(await publicClient.getBalance({ address: recipient })).toBe(amount)
    // Fresh nonce so a revert can only come from the disabled module, not replay protection.
    await expect(
      publicClient.simulateContract({
        account: OTHER_ACCOUNT,
        address: FAUCET,
        abi: faucetAbi,
        functionName: 'drip',
        args: [
          { recipient, data: '0x', nonce: keccak256('0x02') },
          { module: OLD_MODULE, id: keccak256('0x03'), proof },
        ],
      }),
    ).rejects.toThrow(/not supported|not enabled|module/i)

    const output = logs.join('\n')
    expect(output).not.toContain(newSignerKey)
    expect(output).not.toContain(newSignerKey.slice(2))
    expect(output).toContain(newModule)
  }, 120_000)
})
