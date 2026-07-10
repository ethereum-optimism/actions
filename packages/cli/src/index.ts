#!/usr/bin/env node
import { Command, Help } from 'commander'
import pico from 'picocolors'

import { runAssets } from '@/commands/actions/assets.js'
import { borrowCommand } from '@/commands/actions/borrow/index.js'
import { runChains } from '@/commands/actions/chains.js'
import { ensCommand } from '@/commands/actions/ens/index.js'
import { lendCommand } from '@/commands/actions/lend/index.js'
import { swapCommand } from '@/commands/actions/swap/index.js'
import { walletCommand } from '@/commands/wallet/index.js'
import { isEpipeError, writeError } from '@/output/errors.js'
import { setJsonMode } from '@/output/mode.js'

process.stdout.on('error', (err) => {
  if (isEpipeError(err)) process.exit(0)
})
process.stderr.on('error', (err) => {
  if (isEpipeError(err)) process.exit(0)
})
process.on('uncaughtException', (err) => {
  if (isEpipeError(err)) process.exit(0)
  writeError(err)
})
process.on('unhandledRejection', (err) => writeError(err))

const colorizeHelp = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

const program = new Command()
  .name('actions')
  .description('Command Line Interface for the Actions SDK.')
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

program.addCommand(lendCommand())
program.addCommand(borrowCommand())
program.addCommand(swapCommand())
program.addCommand(ensCommand())
program.addCommand(walletCommand())

program.parseAsync(process.argv).catch(writeError)
