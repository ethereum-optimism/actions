/**
 * Aave Pool Diagnostic Script
 *
 * Troubleshooting script to analyze WETH market liquidity on Aave V3 OP Sepolia
 *
 * Usage: npx tsx scripts/aave-pool-diagnostic.ts
 */

import { createPublicClient, http, formatUnits, type Address } from 'viem'
import { optimismSepolia } from 'viem/chains'

// Aave V3 OP Sepolia addresses
const POOL_ADDRESS = '0xb50201558b00496a145fe76f7424749556e326d8' as Address
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address

// ERC20 ABI for basic queries
const ERC20_ABI = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Aave Pool ABI for reserve data
const POOL_ABI = [
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getReserveData',
    outputs: [
      {
        components: [
          { name: 'data', type: 'uint256' },
        ],
        name: 'configuration',
        type: 'tuple',
      },
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
    inputs: [],
    name: 'getReservesList',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Create client
const client = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
})

interface ReserveInfo {
  symbol: string
  name: string
  address: Address
  decimals: number
  aTokenAddress: Address
  variableDebtTokenAddress: Address
  stableDebtTokenAddress: Address
  availableLiquidity: string
  totalDeposits: string
  totalVariableDebt: string
  totalStableDebt: string
  totalDebt: string
  utilizationRate: string
}

async function getReserveInfo(assetAddress: Address): Promise<ReserveInfo> {
  // Get reserve data from pool
  const reserveData = await client.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'getReserveData',
    args: [assetAddress],
  })

  const aTokenAddress = reserveData[8] as Address
  const stableDebtTokenAddress = reserveData[9] as Address
  const variableDebtTokenAddress = reserveData[10] as Address

  // Get token info
  const [symbol, name, decimals] = await Promise.all([
    client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => 'UNKNOWN'),
    client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: 'name' }).catch(() => 'Unknown'),
    client.readContract({ address: assetAddress, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => 18),
  ])

  // Get aToken total supply (total deposits)
  const aTokenSupply = await client.readContract({
    address: aTokenAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  })

  // Get variable debt token total supply
  const variableDebtSupply = await client.readContract({
    address: variableDebtTokenAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  })

  // Get stable debt token total supply
  const stableDebtSupply = await client.readContract({
    address: stableDebtTokenAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  })

  const totalDeposits = formatUnits(aTokenSupply, Number(decimals))
  const totalVariableDebt = formatUnits(variableDebtSupply, Number(decimals))
  const totalStableDebt = formatUnits(stableDebtSupply, Number(decimals))
  const totalDebt = parseFloat(totalVariableDebt) + parseFloat(totalStableDebt)

  // Available liquidity = deposits - borrowed
  const availableLiquidity = parseFloat(totalDeposits) - totalDebt

  // Utilization rate
  const utilizationRate = parseFloat(totalDeposits) > 0
    ? (totalDebt / parseFloat(totalDeposits)) * 100
    : 0

  return {
    symbol: symbol as string,
    name: name as string,
    address: assetAddress,
    decimals: Number(decimals),
    aTokenAddress,
    variableDebtTokenAddress,
    stableDebtTokenAddress,
    availableLiquidity: availableLiquidity.toString(),
    totalDeposits,
    totalVariableDebt,
    totalStableDebt,
    totalDebt: totalDebt.toString(),
    utilizationRate: utilizationRate.toFixed(2),
  }
}

async function main() {
  console.log('='.repeat(80))
  console.log('AAVE V3 OP SEPOLIA POOL DIAGNOSTIC')
  console.log('='.repeat(80))
  console.log()

  // Get all reserves list
  console.log('Fetching all reserves from Pool...')
  const reservesList = await client.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'getReservesList',
  })

  console.log(`Found ${reservesList.length} reserves`)
  console.log()

  // Get info for all reserves
  const allReserves: ReserveInfo[] = []
  for (const assetAddress of reservesList) {
    try {
      const info = await getReserveInfo(assetAddress as Address)
      allReserves.push(info)
    } catch (error) {
      console.log(`  Failed to get info for ${assetAddress}: ${error}`)
    }
  }

  console.log('='.repeat(80))
  console.log('PART 1: WETH MARKET DETAILED ANALYSIS')
  console.log('='.repeat(80))
  console.log()

  // Find WETH reserve
  const wethReserve = allReserves.find(
    r => r.address.toLowerCase() === WETH_ADDRESS.toLowerCase()
  )

  if (!wethReserve) {
    console.log('ERROR: WETH reserve not found!')
  } else {
    console.log('WETH Market Status:')
    console.log('-'.repeat(50))
    console.log(`  WETH Address:              ${wethReserve.address}`)
    console.log(`  aWETH Address:             ${wethReserve.aTokenAddress}`)
    console.log(`  Variable Debt Token:       ${wethReserve.variableDebtTokenAddress}`)
    console.log()
    console.log(`  Total Deposits (aWETH):    ${parseFloat(wethReserve.totalDeposits).toFixed(6)} ETH`)
    console.log(`  Available Liquidity:       ${parseFloat(wethReserve.availableLiquidity).toFixed(6)} ETH`)
    console.log(`  Total Variable Debt:       ${parseFloat(wethReserve.totalVariableDebt).toFixed(6)} ETH`)
    console.log(`  Total Stable Debt:         ${parseFloat(wethReserve.totalStableDebt).toFixed(6)} ETH`)
    console.log(`  Total Debt:                ${parseFloat(wethReserve.totalDebt).toFixed(6)} ETH`)
    console.log()
    console.log(`  Utilization Rate:          ${wethReserve.utilizationRate}%`)
    console.log()

    // Calculate and show the liquidity shortfall
    const availableLiq = parseFloat(wethReserve.availableLiquidity)
    if (availableLiq <= 0) {
      console.log('⚠️  LIQUIDITY SHORTFALL DETECTED!')
      console.log(`  Users can only withdraw:   ${availableLiq.toFixed(6)} ETH`)
      console.log(`  But total deposits are:    ${parseFloat(wethReserve.totalDeposits).toFixed(6)} ETH`)
      console.log(`  All deposited ETH is borrowed out!`)
    } else if (parseFloat(wethReserve.utilizationRate) > 90) {
      console.log('⚠️  HIGH UTILIZATION WARNING!')
      console.log(`  Only ${availableLiq.toFixed(6)} ETH available for withdrawal`)
    }
  }

  console.log()
  console.log('='.repeat(80))
  console.log('PART 2: ALL SUPPORTED ASSETS ON OP SEPOLIA AAVE')
  console.log('='.repeat(80))
  console.log()

  // Sort by utilization descending
  const sortedByUtilization = [...allReserves].sort(
    (a, b) => parseFloat(b.utilizationRate) - parseFloat(a.utilizationRate)
  )

  console.log('Asset'.padEnd(10) + 'Deposits'.padEnd(18) + 'Available'.padEnd(18) + 'Total Debt'.padEnd(18) + 'Util %')
  console.log('-'.repeat(80))

  for (const reserve of sortedByUtilization) {
    const deposits = parseFloat(reserve.totalDeposits)
    const available = parseFloat(reserve.availableLiquidity)
    const debt = parseFloat(reserve.totalDebt)

    // Format based on magnitude
    const formatNum = (n: number): string => {
      if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M'
      if (n >= 1000) return (n / 1000).toFixed(2) + 'K'
      return n.toFixed(4)
    }

    console.log(
      reserve.symbol.padEnd(10) +
      formatNum(deposits).padEnd(18) +
      formatNum(available).padEnd(18) +
      formatNum(debt).padEnd(18) +
      `${reserve.utilizationRate}%`
    )
  }

  console.log()
  console.log('='.repeat(80))
  console.log('PART 3: ASSETS WITH SIGNIFICANT BORROWING (WHO IS BORROWING WETH?)')
  console.log('='.repeat(80))
  console.log()
  console.log('Users borrowing WETH are depositing other assets as collateral.')
  console.log('Looking at reserves with significant deposits (potential collateral):')
  console.log()

  // Sort by total deposits descending
  const sortedByDeposits = [...allReserves]
    .filter(r => r.symbol !== 'WETH')
    .sort((a, b) => parseFloat(b.totalDeposits) - parseFloat(a.totalDeposits))

  console.log('Potential Collateral Assets (sorted by total deposits):')
  console.log('-'.repeat(80))
  for (const reserve of sortedByDeposits.slice(0, 10)) {
    if (parseFloat(reserve.totalDeposits) > 0) {
      console.log(`  ${reserve.symbol.padEnd(8)} - Deposits: ${parseFloat(reserve.totalDeposits).toFixed(4).padEnd(15)} Address: ${reserve.address}`)
    }
  }

  console.log()
  console.log('='.repeat(80))
  console.log('PART 4: ANALYSIS & RECOMMENDATIONS')
  console.log('='.repeat(80))
  console.log()

  const wethUtil = wethReserve ? parseFloat(wethReserve.utilizationRate) : 0

  console.log('1. WILL DEPOSITING MORE ETH HELP?')
  console.log('-'.repeat(50))
  if (wethUtil > 90) {
    console.log('   ❌ NO - The utilization rate is VERY HIGH (>90%).')
    console.log('   On testnets, bots often borrow assets aggressively.')
    console.log('   Depositing more ETH would likely just get borrowed again.')
    console.log('   This is NOT a sustainable solution for demos.')
  } else if (wethUtil > 70) {
    console.log('   ⚠️  MAYBE - The utilization rate is HIGH (>70%).')
    console.log('   Depositing more ETH might help temporarily.')
  } else {
    console.log('   ✅ YES - The utilization rate is moderate.')
    console.log('   Depositing more ETH could help increase available liquidity.')
  }

  console.log()
  console.log('2. ALTERNATIVE ASSETS FOR DEMO')
  console.log('-'.repeat(50))

  // Find assets with low utilization
  const goodAlternatives = allReserves.filter(r => {
    const util = parseFloat(r.utilizationRate)
    return util < 50 && parseFloat(r.totalDeposits) > 0
  }).sort((a, b) => parseFloat(a.utilizationRate) - parseFloat(b.utilizationRate))

  if (goodAlternatives.length > 0) {
    console.log('   Assets with <50% utilization that could work for demo:')
    for (const alt of goodAlternatives.slice(0, 5)) {
      console.log(`   - ${alt.symbol}: ${alt.utilizationRate}% utilization`)
      console.log(`     Address: ${alt.address}`)
      console.log(`     Available: ${parseFloat(alt.availableLiquidity).toFixed(4)}`)
    }
  } else {
    console.log('   ⚠️  No assets found with good liquidity characteristics.')
    console.log('   All markets appear to be heavily utilized.')
  }

  // Look for stablecoins specifically
  console.log()
  console.log('   Stablecoins on OP Sepolia Aave:')
  const stablecoins = allReserves.filter(r =>
    ['USDC', 'DAI', 'USDT', 'GHO', 'sDAI', 'USD'].some(s => r.symbol.includes(s))
  )

  if (stablecoins.length > 0) {
    for (const stable of stablecoins) {
      console.log(`   - ${stable.symbol}: ${stable.address}`)
      console.log(`     Util: ${stable.utilizationRate}%, Available: ${parseFloat(stable.availableLiquidity).toFixed(2)}`)
    }
  } else {
    console.log('   No stablecoins found.')
  }

  console.log()
  console.log('3. FAUCET & CUSTOM MARKET OPTIONS')
  console.log('-'.repeat(50))
  console.log('   For switching to another asset:')
  console.log('   - Aave has a testnet faucet at: https://staging.aave.com/faucet/')
  console.log('   - Or contact Aave team for faucet contract address on OP Sepolia')
  console.log()
  console.log('   Unlike Morpho, Aave markets are protocol-level:')
  console.log('   - You CANNOT create custom markets with infinite mint')
  console.log('   - You must use existing supported assets')
  console.log('   - Faucet is the only way to get testnet tokens')

  console.log()
  console.log('4. RECOMMENDED ACTIONS FOR OPTIMISM TEAM')
  console.log('-'.repeat(50))
  console.log('   Since you work closely with Aave:')
  console.log()
  console.log('   Option A: Fix WETH market')
  console.log('   - Ask Aave to reduce borrow cap on WETH')
  console.log('   - Ask them to liquidate some positions to free up liquidity')
  console.log('   - Deposit a large amount of ETH and monitor if bots take it')
  console.log()
  console.log('   Option B: Switch to different asset')
  console.log('   - Use USDC or another stablecoin if available')
  console.log('   - Get faucet access from Aave')
  console.log('   - Update demo to use that asset instead')
  console.log()
  console.log('   Option C: Hybrid approach')
  console.log('   - Keep Morpho for primary demo (custom market works well)')
  console.log('   - Show Aave as secondary option when liquidity is available')

  console.log()
  console.log('='.repeat(80))
  console.log('END OF DIAGNOSTIC')
  console.log('='.repeat(80))
}

main().catch(console.error)
