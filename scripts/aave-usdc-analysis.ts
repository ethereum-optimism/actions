/**
 * USDC Analysis - Is it mintable? Will bots drain it?
 */

import { createPublicClient, http, formatUnits, type Address } from 'viem'
import { optimismSepolia } from 'viem/chains'

const POOL_ADDRESS = '0xb50201558b00496a145fe76f7424749556e326d8' as Address
const USDC_ADDRESS = '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address

const client = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
})

const ERC20_ABI = [
  { inputs: [], name: 'totalSupply', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

// Check for common mintable token patterns
const MINTABLE_ABI = [
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'mint', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'mint', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'faucet', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'amount', type: 'uint256' }], name: 'faucet', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const

const POOL_ABI = [
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getReserveData',
    outputs: [
      { components: [{ name: 'data', type: 'uint256' }], name: 'configuration', type: 'tuple' },
      { name: 'liquidityIndex', type: 'uint128' },
      { name: 'currentLiquidityRate', type: 'uint128' },
      { name: 'variableBorrowIndex', type: 'uint128' },
      { name: 'currentVariableBorrowRate', type: 'uint128' },
      { name: 'currentStableBorrowRate', type: 'uint128' },
      { name: 'lastUpdateTimestamp', type: 'uint40' },
      { name: 'id', type: 'uint16' },
      { name: 'aTokenAddress', type: 'address' },
      { name: 'stableDebtTokenAddress', type: 'address' },
      { name: 'variableDebtTokenAddress', type: 'address' },
      { name: 'interestRateStrategyAddress', type: 'address' },
      { name: 'accruedToTreasury', type: 'uint128' },
      { name: 'unbacked', type: 'uint128' },
      { name: 'isolationModeTotalDebt', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getConfiguration',
    outputs: [{ components: [{ name: 'data', type: 'uint256' }], name: '', type: 'tuple' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Decode Aave reserve configuration bitmap
function decodeReserveConfig(data: bigint) {
  // Aave V3 configuration bitmap layout:
  // bit 0-15: LTV
  // bit 16-31: Liquidation threshold
  // bit 32-47: Liquidation bonus
  // bit 48-55: Decimals
  // bit 56: reserve is active
  // bit 57: reserve is frozen
  // bit 58: borrowing is enabled
  // bit 59: stable rate borrowing enabled
  // bit 60: asset is paused
  // bit 61: borrowing in isolation mode enabled
  // bit 62: siloed borrowing enabled
  // bit 63: flashloaning enabled
  // bit 64-79: reserve factor
  // bit 80-115: borrow cap
  // bit 116-151: supply cap

  const ltv = Number(data & 0xFFFFn) / 100
  const liquidationThreshold = Number((data >> 16n) & 0xFFFFn) / 100
  const liquidationBonus = Number((data >> 32n) & 0xFFFFn) / 100
  const decimals = Number((data >> 48n) & 0xFFn)
  const isActive = Boolean((data >> 56n) & 1n)
  const isFrozen = Boolean((data >> 57n) & 1n)
  const borrowingEnabled = Boolean((data >> 58n) & 1n)
  const stableBorrowEnabled = Boolean((data >> 59n) & 1n)
  const isPaused = Boolean((data >> 60n) & 1n)
  const reserveFactor = Number((data >> 64n) & 0xFFFFn) / 100
  const borrowCap = Number((data >> 80n) & 0xFFFFFFFFFn)  // 36 bits
  const supplyCap = Number((data >> 116n) & 0xFFFFFFFFFn) // 36 bits

  return {
    ltv,
    liquidationThreshold,
    liquidationBonus,
    decimals,
    isActive,
    isFrozen,
    borrowingEnabled,
    stableBorrowEnabled,
    isPaused,
    reserveFactor,
    borrowCap,
    supplyCap,
  }
}

async function main() {
  console.log('='.repeat(80))
  console.log('USDC ANALYSIS - MINTABILITY & BOT RISK')
  console.log('='.repeat(80))
  console.log()

  // Get USDC token info
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'name' }),
    client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'symbol' }),
    client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'decimals' }),
    client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'totalSupply' }),
  ])

  let owner: string | null = null
  try {
    owner = await client.readContract({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'owner' })
  } catch {
    // No owner function
  }

  console.log('USDC TOKEN INFO:')
  console.log('-'.repeat(50))
  console.log(`  Address:      ${USDC_ADDRESS}`)
  console.log(`  Name:         ${name}`)
  console.log(`  Symbol:       ${symbol}`)
  console.log(`  Decimals:     ${decimals}`)
  console.log(`  Total Supply: ${formatUnits(totalSupply, Number(decimals))} USDC`)
  if (owner) {
    console.log(`  Owner:        ${owner}`)
  }
  console.log()

  // Check for mint/faucet functions by trying to get bytecode and check function selectors
  console.log('CHECKING FOR MINTABLE FUNCTIONS:')
  console.log('-'.repeat(50))

  const bytecode = await client.getCode({ address: USDC_ADDRESS })

  // Function selectors to look for
  const selectors = {
    'mint(address,uint256)': '40c10f19',
    'mint(address,uint256,bool)': '156e29f6',
    'faucet()': 'de5f72fd',
    'faucet(uint256)': '7b56c2b2',
    'configureMinter(address,uint256)': '4e44d956',
  }

  for (const [func, selector] of Object.entries(selectors)) {
    const hasFunction = bytecode?.includes(selector)
    console.log(`  ${func.padEnd(30)} ${hasFunction ? '✅ FOUND' : '❌ Not found'}`)
  }

  console.log()

  // Get Aave reserve data for USDC
  const usdcReserveData = await client.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'getReserveData',
    args: [USDC_ADDRESS],
  })

  const usdcConfig = await client.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'getConfiguration',
    args: [USDC_ADDRESS],
  })

  const aUsdcAddress = usdcReserveData[8] as Address
  const variableDebtUsdcAddress = usdcReserveData[10] as Address

  // Get actual USDC in pool
  const actualUsdcInPool = await client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [aUsdcAddress],
  })

  // Get aUSDC supply and debt
  const aUsdcSupply = await client.readContract({
    address: aUsdcAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  })

  const variableDebtSupply = await client.readContract({
    address: variableDebtUsdcAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  })

  const config = decodeReserveConfig(usdcConfig.data)

  console.log('USDC AAVE MARKET CONFIG:')
  console.log('-'.repeat(50))
  console.log(`  LTV:                    ${config.ltv}%`)
  console.log(`  Liquidation Threshold:  ${config.liquidationThreshold}%`)
  console.log(`  Borrowing Enabled:      ${config.borrowingEnabled}`)
  console.log(`  Supply Cap:             ${config.supplyCap === 0 ? 'UNLIMITED' : config.supplyCap.toLocaleString() + ' USDC'}`)
  console.log(`  Borrow Cap:             ${config.borrowCap === 0 ? 'UNLIMITED' : config.borrowCap.toLocaleString() + ' USDC'}`)
  console.log(`  Is Active:              ${config.isActive}`)
  console.log(`  Is Frozen:              ${config.isFrozen}`)
  console.log(`  Is Paused:              ${config.isPaused}`)
  console.log()

  console.log('USDC MARKET LIQUIDITY:')
  console.log('-'.repeat(50))
  console.log(`  Total Deposits (aUSDC): ${formatUnits(aUsdcSupply, Number(decimals))} USDC`)
  console.log(`  Total Borrowed:         ${formatUnits(variableDebtSupply, Number(decimals))} USDC`)
  console.log(`  Actual USDC in Pool:    ${formatUnits(actualUsdcInPool, Number(decimals))} USDC`)

  const utilization = aUsdcSupply > 0n
    ? Number((aUsdcSupply - actualUsdcInPool) * 10000n / aUsdcSupply) / 100
    : 0
  console.log(`  Utilization:            ${utilization.toFixed(2)}%`)
  console.log()

  // Now compare with WETH to understand the bot behavior
  console.log('='.repeat(80))
  console.log('BOT BEHAVIOR ANALYSIS')
  console.log('='.repeat(80))
  console.log()

  // Get WETH config
  const wethConfig = await client.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'getConfiguration',
    args: [WETH_ADDRESS],
  })

  const wethConfigDecoded = decodeReserveConfig(wethConfig.data)

  console.log('WHY BOTS BORROW WETH:')
  console.log('-'.repeat(50))
  console.log('  Testnet ETH has REAL value (gas, bridging)')
  console.log('  Bots deposit worthless testnet USDC as collateral')
  console.log('  Borrow valuable testnet ETH')
  console.log('  No liquidation risk because USDC is free to mint')
  console.log()

  console.log('WETH CONFIG:')
  console.log(`  LTV:         ${wethConfigDecoded.ltv}% (can borrow this % of collateral value)`)
  console.log(`  Borrow Cap:  ${wethConfigDecoded.borrowCap === 0 ? 'UNLIMITED' : wethConfigDecoded.borrowCap + ' ETH'}`)
  console.log()

  console.log('USDC CONFIG:')
  console.log(`  LTV:         ${config.ltv}% (can borrow this % of collateral value)`)
  console.log(`  Borrow Cap:  ${config.borrowCap === 0 ? 'UNLIMITED' : config.borrowCap + ' USDC'}`)
  console.log()

  console.log('='.repeat(80))
  console.log('SWITCHING TO USDC DEMO - FEASIBILITY')
  console.log('='.repeat(80))
  console.log()

  console.log('SCENARIO: You deposit USDC, users deposit USDC')
  console.log('-'.repeat(50))

  if (config.borrowingEnabled) {
    console.log('  ⚠️  USDC borrowing is ENABLED')
    console.log()
    console.log('  Risk: Bots could deposit ETH (valuable) as collateral')
    console.log('        and borrow your USDC (worthless to them)')
    console.log()
    console.log('  BUT: Why would they? USDC has no real value on testnet')
    console.log('       Unless they can swap it somewhere for ETH...')
  } else {
    console.log('  ✅ USDC borrowing is DISABLED')
    console.log('  Your deposited USDC would stay in the pool!')
  }

  console.log()
  console.log('RECOMMENDATION:')
  console.log('-'.repeat(50))

  if (!config.borrowingEnabled) {
    console.log('  ✅ USDC is a GOOD choice - borrowing disabled')
    console.log('  Users can deposit and withdraw freely')
  } else {
    console.log('  The key question: Can bots GET testnet USDC easily?')
    console.log()
    const hasMint = bytecode?.includes('40c10f19')
    if (hasMint) {
      console.log('  ⚠️  USDC appears to have a mint function')
      console.log('  If anyone can mint, bots can get infinite USDC')
      console.log('  They could deposit USDC, borrow ETH (same problem)')
    } else {
      console.log('  USDC does NOT have an obvious public mint')
      console.log('  If supply is limited, bots cant easily get USDC')
      console.log('  This could work better than ETH')
    }
  }

  console.log()
  console.log('='.repeat(80))
}

main().catch(console.error)
