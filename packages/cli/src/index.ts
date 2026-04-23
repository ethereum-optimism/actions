#!/usr/bin/env node
import { Command, Help } from 'commander'
import pico from 'picocolors'

import { runAssets } from '@/commands/assets.js'
import { runChains } from '@/commands/chains.js'
import { walletCommand } from '@/commands/wallet/index.js'
import { writeError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

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

const colorizeHelp = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

const program = new Command()
  .name('actions')
  .description('Command-line interface for the Actions SDK.')
  .option('--json', 'emit machine-readable JSON on stdout and stderr')
  .hook('preAction', (thisCommand) => {
    setJsonMode(Boolean(thisCommand.opts().json))
  })
  .configureHelp({
    ...new Help(),
    subcommandTerm: (cmd) =>
      colorizeHelp ? pico.cyan(cmd.name()) : cmd.name(),
    commandUsage: (cmd) => {
      const usage = new Help().commandUsage(cmd)
      return colorizeHelp ? pico.bold(usage) : usage
    },
  })

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
