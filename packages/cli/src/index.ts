#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
  .name('actions')
  .description('Agent-first CLI for the Actions SDK.')

await program.parseAsync(process.argv)
