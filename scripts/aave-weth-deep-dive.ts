/**
 * Deep dive into WETH market discrepancy
 *
 * Why is there more debt than deposits?
 */

import { createPublicClient, http, formatUnits, type Address } from 'viem'
import { optimismSepolia } from 'viem/chains'

const POOL_ADDRESS = '0xb50201558b00496a145fe76f7424749556e326d8' as Address
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address

const client = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
})

const ERC20_ABI = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
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

const POOL_ABI = [
  {
    inputs: [{ name: 'asset', type: 'address' }],
    name: 'getReserveData',
    outputs: [
      {
        components: [{ name: 'data', type: 'uint256' }],
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
] as const

// Scaled balance token ABI (for debt tokens)
const SCALED_TOKEN_ABI = [
  {
    inputs: [],
    name: 'scaledTotalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

async function main() {
  console.log('='.repeat(80))
  console.log('WETH MARKET DEEP DIVE - WHY IS DEBT > DEPOSITS?')
  console.log('='.repeat(80))
  console.log()

  // Get reserve data
  const reserveData = await client.readContract({
    address: POOL_ADDRESS,
    abi: POOL_ABI,
    functionName: 'getReserveData',
    args: [WETH_ADDRESS],
  })

  const aTokenAddress = reserveData[8] as Address
  const stableDebtTokenAddress = reserveData[9] as Address
  const variableDebtTokenAddress = reserveData[10] as Address
  const liquidityIndex = reserveData[1]
  const variableBorrowIndex = reserveData[3]
  const accruedToTreasury = reserveData[12]
  const unbacked = reserveData[13]

  console.log('CONTRACT ADDRESSES:')
  console.log('-'.repeat(50))
  console.log(`  WETH:                 ${WETH_ADDRESS}`)
  console.log(`  aWETH:                ${aTokenAddress}`)
  console.log(`  Variable Debt Token:  ${variableDebtTokenAddress}`)
  console.log(`  Stable Debt Token:    ${stableDebtTokenAddress}`)
  console.log()

  console.log('RAW RESERVE DATA FROM POOL:')
  console.log('-'.repeat(50))
  console.log(`  Liquidity Index:      ${liquidityIndex.toString()}`)
  console.log(`  Variable Borrow Index: ${variableBorrowIndex.toString()}`)
  console.log(`  Accrued To Treasury:  ${formatUnits(accruedToTreasury, 18)} ETH`)
  console.log(`  Unbacked:             ${formatUnits(unbacked, 18)} ETH`)
  console.log()

  // Get actual WETH balance in the aToken contract (this is the REAL liquidity)
  const actualWethInPool = await client.readContract({
    address: WETH_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [aTokenAddress],
  })

  // Get aToken total supply
  const aTokenSupply = await client.readContract({
    address: aTokenAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  })

  // Get variable debt token supply
  const variableDebtSupply = await client.readContract({
    address: variableDebtTokenAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  })

  // Get stable debt token supply
  const stableDebtSupply = await client.readContract({
    address: stableDebtTokenAddress,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  })

  // Get scaled supplies (principal without interest)
  let scaledVariableDebt = 0n
  try {
    scaledVariableDebt = await client.readContract({
      address: variableDebtTokenAddress,
      abi: SCALED_TOKEN_ABI,
      functionName: 'scaledTotalSupply',
    })
  } catch (e) {
    console.log('  Could not get scaled variable debt')
  }

  console.log('TOKEN SUPPLIES:')
  console.log('-'.repeat(50))
  console.log(`  aWETH Total Supply:           ${formatUnits(aTokenSupply, 18)} ETH`)
  console.log(`  Variable Debt Total Supply:   ${formatUnits(variableDebtSupply, 18)} ETH`)
  console.log(`  Stable Debt Total Supply:     ${formatUnits(stableDebtSupply, 18)} ETH`)
  console.log(`  Scaled Variable Debt:         ${formatUnits(scaledVariableDebt, 18)} ETH`)
  console.log()

  console.log('ACTUAL LIQUIDITY:')
  console.log('-'.repeat(50))
  console.log(`  Actual WETH in aToken contract: ${formatUnits(actualWethInPool, 18)} ETH`)
  console.log()

  // Calculate the discrepancy
  const totalDebt = variableDebtSupply + stableDebtSupply
  const expectedLiquidity = aTokenSupply - totalDebt

  console.log('ANALYSIS:')
  console.log('-'.repeat(50))
  console.log(`  Total Deposits (aToken supply):  ${formatUnits(aTokenSupply, 18)} ETH`)
  console.log(`  Total Debt:                      ${formatUnits(totalDebt, 18)} ETH`)
  console.log(`  Expected Available Liquidity:    ${formatUnits(expectedLiquidity, 18)} ETH`)
  console.log(`  Actual WETH in Pool:             ${formatUnits(actualWethInPool, 18)} ETH`)
  console.log()

  // The KEY insight
  const discrepancy = actualWethInPool - (aTokenSupply > totalDebt ? aTokenSupply - totalDebt : 0n)

  console.log('KEY FINDINGS:')
  console.log('='.repeat(50))

  if (unbacked > 0n) {
    console.log(`⚠️  UNBACKED DEBT DETECTED: ${formatUnits(unbacked, 18)} ETH`)
    console.log('   This means debt was created without corresponding deposits.')
    console.log('   This is an Aave feature for cross-chain bridging (Portal).')
  }

  if (totalDebt > aTokenSupply) {
    const overBorrow = totalDebt - aTokenSupply
    console.log(`⚠️  OVER-BORROWED: ${formatUnits(overBorrow, 18)} ETH more debt than deposits`)
    console.log()
    console.log('   POSSIBLE EXPLANATIONS:')
    console.log('   1. Interest accrual: Debt grows faster than deposits')
    console.log('      - Debt includes accrued interest')
    console.log('      - If no one has deposited recently, debt outpaces supply')
    console.log()
    console.log('   2. Unbacked minting (Aave Portal):')
    console.log('      - Aave can mint unbacked aTokens for cross-chain transfers')
    console.log('      - These create debt without deposits')
    console.log()
    console.log('   3. This is a TESTNET:')
    console.log('      - Admin functions may have been used to create debt')
    console.log('      - No real liquidations are happening')
    console.log('      - Positions can become deeply underwater')
  }

  console.log()
  console.log('ACTUAL WITHDRAWABLE AMOUNT:')
  console.log('-'.repeat(50))
  console.log(`  Real WETH available: ${formatUnits(actualWethInPool, 18)} ETH`)
  console.log()
  console.log('  This is the ACTUAL amount users can withdraw.')
  console.log('  It represents the real WETH tokens sitting in the contract.')

  // Utilization based on actual liquidity
  const realUtilization = aTokenSupply > 0n
    ? Number((aTokenSupply - actualWethInPool) * 10000n / aTokenSupply) / 100
    : 0

  console.log()
  console.log(`  Real Utilization: ${realUtilization.toFixed(2)}%`)
  console.log(`  (Based on actual WETH in pool vs total deposits)`)

  console.log()
  console.log('='.repeat(80))
}

main().catch(console.error)
