/*
  Rotates the faucet auth module after its signer key leaked: generates a new
  signer key, deploys a new AdminFaucetAuthModule, enables it on the faucet and
  disables the old module. The faucet itself is not redeployed.

  Usage:
    pnpm rotate:faucet-module [--rpc-url <url>] [--key-file <path>]

  Prompts (hidden) for the faucet ADMIN private key. Nothing secret is logged;
  the new signer key and module address are written only to --key-file (default ~/faucet-auth-module-rotation.env).
*/

import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'

import { Command } from 'commander'
import {
  type Address,
  createPublicClient,
  createWalletClient,
  http,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { optimismSepolia } from 'viem/chains'

import { rotateAuthModule } from './faucetAuthModuleRotation.js'

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
    .option(
      '--key-file <path>',
      'where the new signer key is written',
      path.join(os.homedir(), 'faucet-auth-module-rotation.env'),
    )
    .parse()
    .opts()

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

  const { newModule, newSigner } = await rotateAuthModule({
    publicClient: createPublicClient({ transport }),
    walletClient: createWalletClient({
      account,
      chain: optimismSepolia,
      transport,
    }),
    faucet: options.faucet as Address,
    oldModule: options.oldModule as Address,
    keyFile: options.keyFile,
    pause,
    log: console.log,
  })

  console.log(`
New prod values are in ${options.keyFile} (nothing secret was printed):
  AUTH_MODULE_ADDRESS                    = ${newModule}
  FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY   = see the file
Next: set both in the prod secrets, deploy the backend, then delete the file.
The new signer (${newSigner}) owns a new smart wallet that sends drips.
Check it can pay gas (sponsored or funded) before relying on the faucet.`)
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? ((error as { shortMessage?: string }).shortMessage ?? error.message)
      : 'failed',
  )
  process.exit(1)
})
