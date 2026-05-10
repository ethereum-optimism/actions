/*
  Deploys a Velodrome volatile pool for USDC_DEMO/OP_DEMO with initial liquidity.
  Reads token addresses from backend asset config and credentials from .env.

  Usage:
    pnpm deploy:velodrome [extra forge flags...]

  Required .env vars: BASE_SEPOLIA_RPC_URL, DEMO_MARKET_SETUP_PRIVATE_KEY
*/

import 'dotenv/config'

import { execFileSync } from 'node:child_process'

import type { Address } from 'viem'
import { concat, createPublicClient, http, keccak256 } from 'viem'
import { baseSepolia } from 'viem/chains'

import { OP_DEMO, USDC_DEMO } from '../src/config/assets.js'

const ROUTER = '0x6Df1c91424F79E40E33B1A48F0687B666bE71075'
const POOL_FACTORY = '0x7b9644D43900da734f5a83DD0489Af1197DF2CF0'

interface DeployConfig {
  usdcAddress: string
  opAddress: string
  privateKey: string
  rpcUrl: string
  token0: string
  token1: string
  poolId: `0x${string}`
}

function validateEnvironment(): DeployConfig {
  const usdcAddress = USDC_DEMO.address[baseSepolia.id]
  const opAddress = OP_DEMO.address[baseSepolia.id]
  const privateKey = process.env.DEMO_MARKET_SETUP_PRIVATE_KEY
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL

  if (!usdcAddress || !opAddress) {
    console.error('Missing Base Sepolia addresses for USDC_DEMO or OP_DEMO')
    process.exit(1)
  }
  if (!privateKey) {
    console.error('Missing DEMO_MARKET_SETUP_PRIVATE_KEY in .env')
    process.exit(1)
  }
  if (!rpcUrl) {
    console.error('Missing BASE_SEPOLIA_RPC_URL in .env')
    process.exit(1)
  }

  // Sort tokens alphabetically for deterministic pool ID
  const [token0, token1] =
    usdcAddress.toLowerCase() < opAddress.toLowerCase()
      ? [usdcAddress, opAddress]
      : [opAddress, usdcAddress]

  // Pool ID = keccak256(abi.encodePacked(sortedToken0, sortedToken1, stable))
  const poolId = keccak256(
    concat([
      token0 as Address,
      token1 as Address,
      '0x00', // stable = false (volatile pool)
    ]),
  )

  return { usdcAddress, opAddress, privateKey, rpcUrl, token0, token1, poolId }
}

function parseForgeArgs(): string[] {
  const ALLOWED_FORGE_FLAGS = new Set([
    '--verify',
    '--slow',
    '--gas-estimate-multiplier',
    '--legacy',
  ])
  return process.argv.slice(2).filter((arg) => {
    const flag = arg.split('=')[0]
    return ALLOWED_FORGE_FLAGS.has(flag)
  })
}

async function checkExistingPool(
  rpcUrl: string,
  token0: string,
  token1: string,
): Promise<void> {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })

  try {
    const pool = await client.readContract({
      address: POOL_FACTORY as Address,
      abi: [
        {
          inputs: [
            { name: 'tokenA', type: 'address' },
            { name: 'tokenB', type: 'address' },
            { name: 'stable', type: 'bool' },
          ],
          name: 'getPool',
          outputs: [{ name: '', type: 'address' }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      functionName: 'getPool',
      args: [token0 as Address, token1 as Address, false],
    })

    if (pool && pool !== '0x0000000000000000000000000000000000000000') {
      console.log(`\nNote: Velodrome pool already exists at ${pool}`)
      console.log('createPool will revert if this exact pool already exists.\n')
    }
  } catch {
    // getPool may not exist on all factory versions — proceed anyway
  }
}

function runForgeScript(config: DeployConfig, extraArgs: string[]): void {
  const contractsDir = new URL('../../contracts', import.meta.url).pathname

  const forgeArgs = [
    'script',
    'script/DeployVelodromeMarket.s.sol',
    '--rpc-url',
    config.rpcUrl,
    '--broadcast',
    '--private-key',
    config.privateKey,
    ...extraArgs,
  ]

  console.log(
    `\n> forge ${forgeArgs.map((a) => (a === config.privateKey ? '***' : a === config.rpcUrl ? '***' : a)).join(' ')}\n`,
  )
  execFileSync('forge', forgeArgs, {
    cwd: contractsDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      DEMO_USDC_ADDRESS: config.usdcAddress,
      DEMO_OP_ADDRESS: config.opAddress,
    },
  })
}

function logPoolInfo(config: DeployConfig): void {
  console.log('\n=== Velodrome Pool Info ===')
  console.log(`Pool ID:       ${config.poolId}`)
  console.log(`Chain:         Base Sepolia (${baseSepolia.id})`)
  console.log(`Router:        ${ROUTER}`)
  console.log(`PoolFactory:   ${POOL_FACTORY}`)
  console.log(`Token0:        ${config.token0}`)
  console.log(`Token1:        ${config.token1}`)
  console.log(`Stable:        false (volatile)`)
  console.log(`USDC_DEMO:     ${config.usdcAddress}`)
  console.log(`OP_DEMO:       ${config.opAddress}`)
}

async function main(): Promise<void> {
  const config = validateEnvironment()
  const extraArgs = parseForgeArgs()

  await checkExistingPool(config.rpcUrl, config.token0, config.token1)
  runForgeScript(config, extraArgs)

  console.log('\nPool deployed successfully!')
  logPoolInfo(config)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
