/*
  Helper to run the DeployUniswapMarket forge script with token addresses
  pulled from the backend asset config and private key from .env.

  Usage:
    pnpm deploy:uniswap [--rpc-url <RPC_URL>] [extra forge flags...]

  Reads DEMO_MARKET_SETUP_PRIVATE_KEY from packages/demo/backend/.env
*/

import 'dotenv/config'

import { execSync } from 'node:child_process'

import { baseSepolia } from 'viem/chains'

import { OP_DEMO, USDC_DEMO } from '../src/config/assets.js'

const usdcAddress = USDC_DEMO.address[baseSepolia.id]
const opAddress = OP_DEMO.address[baseSepolia.id]
const privateKey = process.env.DEMO_MARKET_SETUP_PRIVATE_KEY

if (!usdcAddress || !opAddress) {
  console.error('Missing Base Sepolia addresses for USDC_DEMO or OP_DEMO')
  process.exit(1)
}

if (!privateKey) {
  console.error('Missing DEMO_MARKET_SETUP_PRIVATE_KEY in .env')
  process.exit(1)
}

const forgeArgs = process.argv.slice(2).join(' ')
const contractsDir = new URL('../../contracts', import.meta.url).pathname

const cmd = [
  `cd ${contractsDir} &&`,
  `DEMO_USDC_ADDRESS=${usdcAddress}`,
  `DEMO_OP_ADDRESS=${opAddress}`,
  `forge script script/DeployUniswapMarket.s.sol`,
  `--broadcast`,
  `--private-key ${privateKey}`,
  forgeArgs,
].join(' ')

// Log command without private key
const safeCmd = cmd.replace(privateKey, '***')
console.log(`\n> ${safeCmd}\n`)
execSync(cmd, { stdio: 'inherit' })
