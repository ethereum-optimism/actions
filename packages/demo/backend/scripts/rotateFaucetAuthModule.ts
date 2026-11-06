/*
  Rotates the faucet auth module signer: deploys a new AdminFaucetAuthModule,
  enables it on the faucet and disables the old module. The faucet itself is
  not redeployed.

  Usage:
    pnpm rotate:faucet-module [--existing-signer] [--key-file <path>] [--rpc-url <url>]

  By default a new signer key is generated and written to --key-file (0600,
  default ~/faucet-auth-module-rotation.env) along with the new module address.
  With --existing-signer you are prompted for the address of a key you already
  have (its key is never needed). Prompts (hidden) for the faucet ADMIN private
  key. No private key is logged.
*/

import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'

import { Command } from 'commander'
import {
  type Address,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { optimismSepolia } from 'viem/chains'

import {
  loadCreationCode,
  rotateAuthModule,
  type SignerChoice,
} from './faucetAuthModuleRotation.js'

const DEFAULT_FAUCET = '0xAe23F412d318Ceb3E91De8FA57e8728a30733CAE'
const DEFAULT_OLD_MODULE = '0x23C86891F94A92DB3f4cE292aF6dA1b4e5330A00'
// 64 hex characters with an optional 0x prefix.
const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/

/** Reads one line without echoing it. */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdout.write(prompt)
    let input = ''
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.removeListener('data', onData)
          process.stdout.write('\n')
          return resolve(input)
        }
        if (ch === '\u0003') process.exit(130)
        if (ch === '\u007f' || ch === '\b') input = input.slice(0, -1)
        else input += ch
      }
    }
    process.stdin.on('data', onData)
  })
}

async function ask(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(question)
  rl.close()
  return answer.trim()
}

async function pause(message: string) {
  await ask(`\n${message}\nPress Enter to continue (Ctrl-C to stop) `)
}

async function chooseSigner(options: {
  existingSigner?: boolean
  keyFile: string
}): Promise<SignerChoice> {
  if (!options.existingSigner) {
    console.log('\nNo --existing-signer provided, minting a new signer key...')
    return { keyFile: options.keyFile }
  }
  const typed = await ask(
    'Enter the existing signer address (the key that signs drips, not the module): ',
  )
  if (!isAddress(typed)) {
    throw new Error('not an Ethereum address (0x + 40 hex characters)')
  }
  return { address: getAddress(typed) }
}

async function main() {
  const options = new Command()
    .option(
      '--rpc-url <url>',
      'OP Sepolia RPC',
      'https://optimism-sepolia-rpc.publicnode.com',
    )
    .option('--faucet <address>', 'faucet contract', DEFAULT_FAUCET)
    .option('--old-module <address>', 'module to disable', DEFAULT_OLD_MODULE)
    .option(
      '--existing-signer',
      'prompt for an existing signer address instead of generating a new key',
    )
    .option(
      '--key-file <path>',
      'where a generated signer key is written',
      path.join(os.homedir(), 'faucet-auth-module-rotation.env'),
    )
    .parse()
    .opts()

  console.log('Building the auth module...')
  const creationCode = loadCreationCode()

  const typed = (
    await readHidden('Enter the existing faucet ADMIN private key (hidden): ')
  ).trim()
  if (!PRIVATE_KEY_PATTERN.test(typed)) {
    throw new Error(
      `not a private key (length ${typed.length}, expected 64 hex characters)`,
    )
  }
  const account = privateKeyToAccount(
    typed.startsWith('0x') ? (typed as `0x${string}`) : `0x${typed}`,
  )
  const transport = http(options.rpcUrl)

  const signer = await chooseSigner(
    options as { existingSigner?: boolean; keyFile: string },
  )

  const { newModule, newSigner } = await rotateAuthModule({
    publicClient: createPublicClient({ transport }),
    walletClient: createWalletClient({
      account,
      chain: optimismSepolia,
      transport,
    }),
    faucet: options.faucet as Address,
    oldModule: options.oldModule as Address,
    signer,
    creationCode,
    pause,
    log: console.log,
  })

  const signerKey =
    'keyFile' in signer
      ? `copy from ${signer.keyFile}`
      : 'the private key of your existing signer'
  console.log(`
Done. Update prod:
  AUTH_MODULE_ADDRESS                    = ${newModule}   (the new module contract; plain deploy config, not a secret)
  FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY   = ${signerKey}   (secret; key of signer ${newSigner})
Then deploy the backend${'keyFile' in signer ? ` and delete ${signer.keyFile}` : ''}.
The signer owns a new smart wallet that sends drips: check it can pay gas
(sponsored or funded) before relying on the faucet.`)
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? ((error as { shortMessage?: string }).shortMessage ?? error.message)
      : 'failed',
  )
  process.exit(1)
})
