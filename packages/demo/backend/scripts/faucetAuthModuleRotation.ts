import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
  isAddressEqual,
  parseAbi,
  type PublicClient,
  type WalletClient,
  zeroAddress,
} from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { optimismSepolia } from 'viem/chains'

const contractsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../contracts',
)

/** Builds OP's AdminFaucetAuthModule from the pinned OP monorepo and returns its creation bytecode. */
export function loadCreationCode(): Hex {
  const stdio: ['ignore', 'ignore', 'inherit'] = ['ignore', 'ignore', 'inherit']
  execFileSync(path.join(contractsDir, 'script/install-optimism.sh'), { stdio })
  execFileSync('forge', ['build', '--root', contractsDir], { stdio })
  const artifact = JSON.parse(
    readFileSync(
      path.join(
        contractsDir,
        'out/AdminFaucetAuthModule.sol/AdminFaucetAuthModule.json',
      ),
      'utf8',
    ),
  )
  return artifact.bytecode.object as Hex
}

/** Domain the backend signs with (services/faucet.ts) and the live module uses. */
const MODULE_NAME = 'OffChainAuthModule'
const MODULE_VERSION = '1'
const moduleAbi = parseAbi(['function ADMIN() view returns (address)'])
/** Typed subset of the live faucet ABI (the repo copy is not `as const`). */
export const faucetModuleAbi = parseAbi([
  'function ADMIN() view returns (address)',
  'function modules(address) view returns (string name, bool enabled, uint256 ttl, uint256 amount)',
  'struct ModuleConfig { string name; bool enabled; uint256 ttl; uint256 amount; }',
  'function configure(address _module, ModuleConfig _config)',
])

/** Either an existing signer (address only) or a fresh key written to `keyFile`. */
export type SignerChoice = { address: Address } | { keyFile: string }

export interface RotationConfig {
  publicClient: PublicClient
  walletClient: WalletClient
  faucet: Address
  oldModule: Address
  signer: SignerChoice
  creationCode: Hex
  pause: (message: string) => Promise<void>
  log: (line: string) => void
}

/** Writes a new signer key to a 0600 file and returns its address. Never overwrites. */
export function writeSignerKeyFile(keyFile: string): Address {
  const privateKey = generatePrivateKey()
  const address = privateKeyToAddress(privateKey)
  writeFileSync(
    keyFile,
    `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY=${privateKey}\nFAUCET_AUTH_MODULE_ADMIN_ADDRESS=${address}\n`,
    { flag: 'wx', mode: 0o600 },
  )
  return address
}

/**
 * Deploys a new auth module for the new signer, enables it on the faucet and
 * disables the old one. The caller's wallet must be the faucet ADMIN.
 * Private keys are never logged.
 */
export async function rotateAuthModule(config: RotationConfig) {
  const { publicClient, walletClient, faucet, oldModule, log } = config
  const account = walletClient.account
  if (!account) throw new Error('walletClient has no account')

  await assertReady(config, account.address)
  const oldConfig = await readModuleConfig(publicClient, faucet, oldModule)
  const newSigner = await resolveSigner(config)

  log(`New signer address: ${newSigner}`)
  await config.pause(
    'keyFile' in config.signer
      ? `Back up ${config.signer.keyFile}, then continue to deploy.`
      : 'Check this is the address of your existing key, then continue.',
  )

  log('Step 1: deploy the new auth module')
  const deployHash = await walletClient.sendTransaction({
    account,
    chain: optimismSepolia,
    data: `${config.creationCode}${encodeAbiParameters(
      [{ type: 'address' }, { type: 'string' }, { type: 'string' }],
      [newSigner, MODULE_NAME, MODULE_VERSION],
    ).slice(2)}` as Hex,
  })
  const deployReceipt = await publicClient.waitForTransactionReceipt({
    hash: deployHash,
  })
  if (deployReceipt.status !== 'success' || !deployReceipt.contractAddress) {
    throw new Error('module deploy failed')
  }
  const newModule = getAddress(deployReceipt.contractAddress)
  const onchainSigner = await publicClient.readContract({
    address: newModule,
    abi: moduleAbi,
    functionName: 'ADMIN',
  })
  if (onchainSigner.toLowerCase() !== newSigner.toLowerCase()) {
    throw new Error('deployed module signer does not match the new signer')
  }
  if ('keyFile' in config.signer) {
    appendFileSync(config.signer.keyFile, `AUTH_MODULE_ADDRESS=${newModule}\n`)
  }
  log(`  NEW MODULE ADDRESS: ${newModule}`)
  await config.pause(
    'Copy the module address (this is the new AUTH_MODULE_ADDRESS), then continue to enable it.',
  )

  log('Step 2: enable the new module on the faucet')
  await configureModule(config, newModule, { ...oldConfig, enabled: true })
  await expectEnabled(publicClient, faucet, newModule, true)
  await config.pause('New module is live. Continue to disable the old one.')

  log('Step 3: disable the old module')
  await configureModule(config, oldModule, { ...oldConfig, enabled: false })
  await expectEnabled(publicClient, faucet, oldModule, false)

  log('Done: old module disabled, new module enabled.')
  return { newModule, newSigner }
}

/** Generates the key file for a fresh signer, or validates an existing signer address. */
async function resolveSigner(config: RotationConfig): Promise<Address> {
  if ('keyFile' in config.signer)
    return writeSignerKeyFile(config.signer.keyFile)

  const { address } = config.signer
  if (isAddressEqual(address, zeroAddress)) {
    throw new Error('new signer is the zero address')
  }
  const oldSigner = await config.publicClient.readContract({
    address: config.oldModule,
    abi: moduleAbi,
    functionName: 'ADMIN',
  })
  if (isAddressEqual(oldSigner, address)) {
    throw new Error('new signer is the same as the old module signer')
  }
  return address
}

interface ModuleConfig {
  name: string
  enabled: boolean
  ttl: bigint
  amount: bigint
}

async function assertReady(config: RotationConfig, caller: Address) {
  const chainId = await config.publicClient.getChainId()
  if (chainId !== optimismSepolia.id) {
    throw new Error(
      `expected OP Sepolia (${optimismSepolia.id}), got ${chainId}`,
    )
  }
  const admin = await config.publicClient.readContract({
    address: config.faucet,
    abi: faucetModuleAbi,
    functionName: 'ADMIN',
  })
  if (admin.toLowerCase() !== caller.toLowerCase()) {
    throw new Error(`key is ${caller}, but the faucet ADMIN is ${admin}`)
  }
}

async function readModuleConfig(
  publicClient: PublicClient,
  faucet: Address,
  module: Address,
): Promise<ModuleConfig> {
  const [name, enabled, ttl, amount] = await publicClient.readContract({
    address: faucet,
    abi: faucetModuleAbi,
    functionName: 'modules',
    args: [module],
  })
  return { name, enabled, ttl, amount }
}

async function configureModule(
  config: RotationConfig,
  module: Address,
  moduleConfig: ModuleConfig,
) {
  const hash = await config.walletClient.sendTransaction({
    account: config.walletClient.account!,
    chain: optimismSepolia,
    to: config.faucet,
    data: encodeFunctionData({
      abi: faucetModuleAbi,
      functionName: 'configure',
      args: [module, moduleConfig],
    }),
  })
  const receipt = await config.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success')
    throw new Error(`configure ${module} reverted`)
}

async function expectEnabled(
  publicClient: PublicClient,
  faucet: Address,
  module: Address,
  expected: boolean,
) {
  const { enabled } = await readModuleConfig(publicClient, faucet, module)
  if (enabled !== expected) {
    throw new Error(`module ${module} enabled=${enabled}, expected ${expected}`)
  }
}
