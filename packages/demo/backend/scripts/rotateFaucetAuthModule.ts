/*
  Rotates the faucet auth module signer: deploys a new
  AdminFaucetAuthModule for a signer address you pass in, enables it on the
  faucet and disables the old module. The faucet itself is not redeployed.

  Create the new signer key first (private key goes to a 0600 file, not the terminal):
    (umask 077; cast wallet new --json > ~/faucet-new-signer.json)
    jq -r '.[0].address' ~/faucet-new-signer.json

  Usage:
    pnpm rotate:faucet-module --signer <new signer address> [--rpc-url <url>]

  Prompts (hidden) for the faucet ADMIN private key. No private key is logged
  and this script never sees the new signer key.
*/

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

async function pause(message: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  await rl.question(`\n${message}\nPress Enter to continue (Ctrl-C to stop) `)
  rl.close()
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
    .requiredOption('--signer <address>', 'address of the new signer key')
    .parse()
    .opts()

  if (!isAddress(options.signer)) {
    throw new Error(
      '--signer must be an Ethereum address (0x + 40 hex characters)',
    )
  }

  console.log('Building the auth module (first run fetches the OP monorepo)...')
  const creationCode = loadCreationCode()

  const typed = (await readHidden('Faucet ADMIN private key (hidden): ')).trim()
  if (!PRIVATE_KEY_PATTERN.test(typed)) {
    throw new Error(
      `not a private key (length ${typed.length}, expected 64 hex characters)`,
    )
  }
  const account = privateKeyToAccount(
    typed.startsWith('0x') ? (typed as `0x${string}`) : `0x${typed}`,
  )
  const transport = http(options.rpcUrl)

  const { newModule } = await rotateAuthModule({
    publicClient: createPublicClient({ transport }),
    walletClient: createWalletClient({
      account,
      chain: optimismSepolia,
      transport,
    }),
    faucet: options.faucet as Address,
    oldModule: options.oldModule as Address,
    newSigner: getAddress(options.signer),
    creationCode,
    pause,
    log: console.log,
  })

  console.log(`
Done. Set in the prod secrets:
  AUTH_MODULE_ADDRESS                    = ${newModule}
  FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY   = the private key of ${options.signer}
Then deploy the backend.
That signer owns a new smart wallet that sends drips: check it can pay gas
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
