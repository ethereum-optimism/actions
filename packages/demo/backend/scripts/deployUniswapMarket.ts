/*
  Deploys a Uniswap V4 pool for USDC_DEMO/OP_DEMO with initial liquidity.
  Reads token addresses from backend asset config and credentials from .env.

  Usage:
    pnpm deploy:uniswap [extra forge flags...]

  Required .env vars: BASE_SEPOLIA_RPC_URL, DEMO_MARKET_SETUP_PRIVATE_KEY
*/

import 'dotenv/config'

import { execFileSync } from 'node:child_process'

import { createPublicClient, encodePacked, http, keccak256 } from 'viem'
import { baseSepolia } from 'viem/chains'

import { OP_DEMO, USDC_DEMO } from '../src/config/assets.js'

const POOL_MANAGER = '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408'
const FEE = 100
const TICK_SPACING = 2

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

// Sort tokens the same way V4 does (currency0 < currency1)
const [token0, token1] =
  usdcAddress.toLowerCase() < opAddress.toLowerCase()
    ? [usdcAddress, opAddress]
    : [opAddress, usdcAddress]

// Compute poolId = keccak256(abi.encode(PoolKey))
const poolId = keccak256(
  encodePacked(
    ['address', 'address', 'uint24', 'int24', 'address'],
    [
      token0 as `0x${string}`,
      token1 as `0x${string}`,
      FEE,
      TICK_SPACING,
      '0x0000000000000000000000000000000000000000',
    ],
  ),
)

function logPoolInfo(): void {
  console.log('\n=== Uniswap V4 Pool Info ===')
  console.log(`Pool ID:       ${poolId}`)
  console.log(`Chain:         Base Sepolia (${baseSepolia.id})`)
  console.log(`PoolManager:   ${POOL_MANAGER}`)
  console.log(`Token0:        ${token0}`)
  console.log(`Token1:        ${token1}`)
  console.log(`Fee:           ${FEE} (${FEE / 10_000}%)`)
  console.log(`Tick Spacing:  ${TICK_SPACING}`)
  console.log(`USDC_DEMO:     ${usdcAddress}`)
  console.log(`OP_DEMO:       ${opAddress}`)
}

function logNextSteps(): void {
  console.log('\n=== Next Steps ===')
  console.log(
    'Add the swap market config to your ActionsConfig in these files:\n',
  )
  console.log('  Frontend: packages/demo/frontend/src/config/actions.ts')
  console.log('  Backend:  packages/demo/backend/src/config/actions.ts\n')
  console.log('Example config:\n')
  console.log(`  swap: {
    uniswap: {
      defaultSlippage: 0.005,
      marketAllowlist: [{ assets: [USDC_DEMO, OP_DEMO] }],
    },
  }`)
  console.log('')
}

async function main(): Promise<void> {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  })

  // Check if pool already has liquidity by checking token balances in PoolManager
  const usdcBalance = await client.readContract({
    address: usdcAddress as `0x${string}`,
    abi: [
      {
        inputs: [{ name: 'account', type: 'address' }],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'balanceOf',
    args: [POOL_MANAGER],
  })

  if (usdcBalance > 0n) {
    console.log(
      `\nNote: PoolManager already holds ${Number(usdcBalance) / 1e6} USDC_DEMO (may be from a different pool).`,
    )
    console.log(
      'Proceeding with deployment — initialize will revert if this exact pool already exists.\n',
    )
  }

  // Deploy using execFileSync to prevent command injection
  const contractsDir = new URL('../../contracts', import.meta.url).pathname

  const ALLOWED_FORGE_FLAGS = new Set([
    '--verify',
    '--slow',
    '--gas-estimate-multiplier',
    '--legacy',
  ])
  const extraArgs = process.argv.slice(2).filter((arg) => {
    const flag = arg.split('=')[0]
    return ALLOWED_FORGE_FLAGS.has(flag)
  })

  const forgeArgs = [
    'script',
    'script/DeployUniswapMarket.s.sol',
    '--rpc-url',
    rpcUrl,
    '--broadcast',
    '--private-key',
    privateKey,
    ...extraArgs,
  ]

  console.log(
    `\n> forge ${forgeArgs.map((a) => (a === privateKey ? '***' : a === rpcUrl ? '***' : a)).join(' ')}\n`,
  )
  execFileSync('forge', forgeArgs, {
    cwd: contractsDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      DEMO_USDC_ADDRESS: usdcAddress,
      DEMO_OP_ADDRESS: opAddress,
    },
  })

  console.log('\nPool deployed successfully!')
  logPoolInfo()
  logNextSteps()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
