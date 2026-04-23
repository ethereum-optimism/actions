#!/usr/bin/env node
import { Command } from 'commander'

import { runAssets } from '@/commands/assets.js'
import { runChains } from '@/commands/chains.js'
import { walletCommand } from '@/commands/wallet/index.js'
import { writeError } from '@/output/errors.js'

function isEpipe(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'EPIPE'
  )
}

process.stdout.on('error', (err) => {
  if (isEpipe(err)) process.exit(0)
})
process.stderr.on('error', (err) => {
  if (isEpipe(err)) process.exit(0)
})
process.on('uncaughtException', (err) => {
  if (isEpipe(err)) process.exit(0)
  writeError(err)
})
process.on('unhandledRejection', (err) => writeError(err))

const program = new Command()
  .name('actions')
  .description('Agent-first CLI for the Actions SDK.')

program
  .command('assets')
  .description('List the configured asset allowlist.')
  .action(runAssets)

program
  .command('chains')
  .description('List the configured chains with their shortnames.')
  .action(runChains)

program.addCommand(walletCommand())

program.parseAsync(process.argv).catch(writeError)
