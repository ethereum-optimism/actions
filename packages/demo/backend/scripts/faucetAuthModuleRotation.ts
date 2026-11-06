import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  type Address,
  encodeAbiParameters,
  encodeFunctionData,
  formatEther,
  getAddress,
  type Hex,
  isAddressEqual,
  pad,
  parseAbi,
  type PublicClient,
  type WalletClient,
  zeroAddress,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
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

/** Coinbase smart wallet factory the SDK derives backend smart wallets from. */
const SMART_WALLET_FACTORY: Address =
  '0xBA5ED110eFDBa3D005bfC882d75358ACBbB85842'
const smartWalletFactoryAbi = parseAbi([
  'function getAddress(bytes[] owners, uint256 nonce) view returns (address)',
])

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

/** Writes a new signer key to a 0600 file. Never overwrites. */
export function writeSignerKeyFile(keyFile: string) {
  const privateKey = generatePrivateKey()
  const { address } = privateKeyToAccount(privateKey)
  writeFileSync(
    keyFile,
    `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY=${privateKey}\nFAUCET_AUTH_MODULE_ADMIN_ADDRESS=${address}\n`,
    { flag: 'wx', mode: 0o600 },
  )
  return { address, privateKey }
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
  const oldSigner = await readModuleSigner(publicClient, oldModule)
  const { address: newSigner } = resolveSigner(config, oldSigner)

  log(`New signer address (the key that signs drips): ${newSigner}`)
  if ('keyFile' in config.signer) {
    log(
      `New signer key saved to ${config.signer.keyFile} (copied into prod secrets at the end)`,
    )
  }
  const smartWallet = await logSmartWallets(config, oldSigner, newSigner)
  await config.pause('Continue to deploy the new auth module contract.')

  log('Step 1: deploy the new auth module contract')
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
  const onchainSigner = await readModuleSigner(publicClient, newModule)
  if (!isAddressEqual(onchainSigner, newSigner)) {
    throw new Error('deployed module signer does not match the new signer')
  }
  if ('keyFile' in config.signer) {
    appendFileSync(config.signer.keyFile, `AUTH_MODULE_ADDRESS=${newModule}\n`)
  }
  log(`  New module address (the contract): ${newModule}`)
  await config.pause(
    'Copy the new module address (this is AUTH_MODULE_ADDRESS, a plain config value), then continue to enable it.',
  )

  log('Step 2: enable the new module on the faucet')
  await configureModule(config, newModule, { ...oldConfig, enabled: true })
  await expectEnabled(publicClient, faucet, newModule, true)

  await config.pause(
    'New module is live. To avoid faucet downtime, update prod and roll out the backend before disabling the old module (it stays enabled meanwhile). Continue to disable the old one.',
  )

  log('Step 3: disable the old module')
  await configureModule(config, oldModule, { ...oldConfig, enabled: false })
  await expectEnabled(publicClient, faucet, oldModule, false)

  log('Done: old module disabled, new module enabled.')
  return { newModule, newSigner, smartWallet }
}

/** Generates the key file for a fresh signer, or validates an existing signer address. */
function resolveSigner(config: RotationConfig, oldSigner: Address) {
  if ('keyFile' in config.signer)
    return writeSignerKeyFile(config.signer.keyFile)

  const { address } = config.signer
  if (isAddressEqual(address, zeroAddress)) {
    throw new Error('new signer is the zero address')
  }
  if (isAddressEqual(oldSigner, address)) {
    throw new Error('new signer is the same as the old module signer')
  }
  return { address, privateKey: undefined }
}

function readModuleSigner(publicClient: PublicClient, module: Address) {
  return publicClient.readContract({
    address: module,
    abi: moduleAbi,
    functionName: 'ADMIN',
  })
}

/** The backend sends drips from a smart wallet derived from the signer (same derivation as the SDK). */
function getSmartWalletAddress(publicClient: PublicClient, signer: Address) {
  return publicClient.readContract({
    address: SMART_WALLET_FACTORY,
    abi: smartWalletFactoryAbi,
    functionName: 'getAddress',
    args: [[pad(signer)], 0n],
  })
}

/** Logs the old and new signers' smart wallet balances and warns if the new one is unfunded. */
async function logSmartWallets(
  config: RotationConfig,
  oldSigner: Address,
  newSigner: Address,
) {
  const { publicClient, log } = config
  const [oldWallet, newWallet] = await Promise.all([
    getSmartWalletAddress(publicClient, oldSigner),
    getSmartWalletAddress(publicClient, newSigner),
  ])
  const [oldBalance, newBalance] = await Promise.all([
    publicClient.getBalance({ address: oldWallet }),
    publicClient.getBalance({ address: newWallet }),
  ])
  log(
    `Backend smart wallet, old signer: ${oldWallet} (${formatEther(oldBalance)} ETH)`,
  )
  log(
    `Backend smart wallet, new signer: ${newWallet} (${formatEther(newBalance)} ETH)`,
  )
  if (oldBalance > 0n && newBalance === 0n) {
    log(
      `  WARNING: the old smart wallet is funded and the new one is not. Fund ${newWallet} on OP Sepolia if drips are not sponsored.`,
    )
  } else if (oldBalance === 0n && newBalance === 0n) {
    log('  Both are empty, so gas is presumably sponsored by the bundler.')
  }
  return newWallet
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
