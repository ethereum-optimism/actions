/**
 * Aave Admin Analysis - Who can configure borrow caps?
 * And who controls the testnet USDC?
 */

import { createPublicClient, http, formatUnits, type Address } from 'viem'
import { optimismSepolia } from 'viem/chains'

const POOL_ADDRESS = '0xb50201558b00496a145fe76f7424749556e326d8' as Address
const POOL_ADDRESSES_PROVIDER = '0x36616cf17557639614c1cdDb356b1B83fc0B2132' as Address
const USDC_ADDRESS = '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address

const client = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
})

// Pool Addresses Provider ABI
const POOL_ADDRESSES_PROVIDER_ABI = [
  { inputs: [], name: 'getACLAdmin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getACLManager', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getPoolConfigurator', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'getPool', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
] as const

// ACL Manager ABI - who has what roles
const ACL_MANAGER_ABI = [
  { inputs: [], name: 'POOL_ADMIN_ROLE', outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'RISK_ADMIN_ROLE', outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'ASSET_LISTING_ADMIN_ROLE', outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'role', type: 'bytes32' }], name: 'getRoleAdmin', outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'role', type: 'bytes32' }, { name: 'account', type: 'address' }], name: 'hasRole', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'admin', type: 'address' }], name: 'isPoolAdmin', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'admin', type: 'address' }], name: 'isRiskAdmin', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'admin', type: 'address' }], name: 'isAssetListingAdmin', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
] as const

// Pool Configurator ABI - this is what sets borrow caps
const POOL_CONFIGURATOR_ABI = [
  // View who can call these
  { inputs: [{ name: 'asset', type: 'address' }, { name: 'newBorrowCap', type: 'uint256' }], name: 'setBorrowCap', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'asset', type: 'address' }, { name: 'newSupplyCap', type: 'uint256' }], name: 'setSupplyCap', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'asset', type: 'address' }, { name: 'enabled', type: 'bool' }], name: 'setReserveBorrowing', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'asset', type: 'address' }], name: 'setReserveFreeze', outputs: [], stateMutability: 'nonpayable', type: 'function' },
] as const

// Check testnet USDC contract for minting capabilities
const TESTNET_TOKEN_ABI = [
  { inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'admin', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'minter', outputs: [{ name: '', type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'minters', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: '', type: 'address' }], name: 'isMinter', outputs: [{ name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
] as const

async function main() {
  console.log('='.repeat(80))
  console.log('AAVE ADMIN & CONFIGURATION ANALYSIS')
  console.log('='.repeat(80))
  console.log()

  // Get all the admin addresses
  console.log('AAVE PROTOCOL ADDRESSES:')
  console.log('-'.repeat(50))

  const [aclAdmin, aclManager, poolConfigurator, pool] = await Promise.all([
    client.readContract({ address: POOL_ADDRESSES_PROVIDER, abi: POOL_ADDRESSES_PROVIDER_ABI, functionName: 'getACLAdmin' }),
    client.readContract({ address: POOL_ADDRESSES_PROVIDER, abi: POOL_ADDRESSES_PROVIDER_ABI, functionName: 'getACLManager' }),
    client.readContract({ address: POOL_ADDRESSES_PROVIDER, abi: POOL_ADDRESSES_PROVIDER_ABI, functionName: 'getPoolConfigurator' }),
    client.readContract({ address: POOL_ADDRESSES_PROVIDER, abi: POOL_ADDRESSES_PROVIDER_ABI, functionName: 'getPool' }),
  ])

  let providerOwner: Address | null = null
  try {
    providerOwner = await client.readContract({ address: POOL_ADDRESSES_PROVIDER, abi: POOL_ADDRESSES_PROVIDER_ABI, functionName: 'owner' })
  } catch {}

  console.log(`  Pool:                    ${pool}`)
  console.log(`  Pool Addresses Provider: ${POOL_ADDRESSES_PROVIDER}`)
  console.log(`  Pool Configurator:       ${poolConfigurator}`)
  console.log(`  ACL Manager:             ${aclManager}`)
  console.log(`  ACL Admin:               ${aclAdmin}`)
  if (providerOwner) {
    console.log(`  Provider Owner:          ${providerOwner}`)
  }
  console.log()

  // Check what roles exist and who has them
  console.log('ACL ROLES (who can configure the pool):')
  console.log('-'.repeat(50))

  const poolAdminRole = await client.readContract({
    address: aclManager as Address,
    abi: ACL_MANAGER_ABI,
    functionName: 'POOL_ADMIN_ROLE',
  })

  const riskAdminRole = await client.readContract({
    address: aclManager as Address,
    abi: ACL_MANAGER_ABI,
    functionName: 'RISK_ADMIN_ROLE',
  })

  console.log(`  POOL_ADMIN_ROLE:  ${poolAdminRole}`)
  console.log(`  RISK_ADMIN_ROLE:  ${riskAdminRole}`)
  console.log()

  // Check if ACL Admin has these roles
  const aclAdminIsPoolAdmin = await client.readContract({
    address: aclManager as Address,
    abi: ACL_MANAGER_ABI,
    functionName: 'isPoolAdmin',
    args: [aclAdmin as Address],
  })

  const aclAdminIsRiskAdmin = await client.readContract({
    address: aclManager as Address,
    abi: ACL_MANAGER_ABI,
    functionName: 'isRiskAdmin',
    args: [aclAdmin as Address],
  })

  console.log(`  ACL Admin (${aclAdmin}):`)
  console.log(`    Is Pool Admin: ${aclAdminIsPoolAdmin}`)
  console.log(`    Is Risk Admin: ${aclAdminIsRiskAdmin}`)
  console.log()

  console.log('='.repeat(80))
  console.log('HOW TO CHANGE WETH BORROW CAP')
  console.log('='.repeat(80))
  console.log()

  console.log('The PoolConfigurator contract has these functions:')
  console.log('-'.repeat(50))
  console.log('  setBorrowCap(asset, newBorrowCap)')
  console.log('    - Sets max amount that can be borrowed')
  console.log('    - Set to 0 to disable borrowing cap (unlimited)')
  console.log('    - Requires RISK_ADMIN_ROLE or POOL_ADMIN_ROLE')
  console.log()
  console.log('  setReserveBorrowing(asset, enabled)')
  console.log('    - Enables/disables borrowing entirely')
  console.log('    - Set to false to completely disable WETH borrowing')
  console.log('    - Requires POOL_ADMIN_ROLE')
  console.log()
  console.log('  setReserveFreeze(asset)')
  console.log('    - Freezes the reserve (no new borrows/deposits)')
  console.log('    - Existing positions can still be managed')
  console.log('    - Requires POOL_ADMIN_ROLE or EMERGENCY_ADMIN_ROLE')
  console.log()

  console.log('WHO CAN MAKE THESE CHANGES:')
  console.log('-'.repeat(50))
  console.log(`  ACL Admin: ${aclAdmin}`)
  console.log()
  console.log('  This is likely an Aave-controlled address.')
  console.log('  You need to contact Aave team to:')
  console.log('    1. Set WETH borrow cap to a low number (e.g., 10 ETH)')
  console.log('    2. Or disable WETH borrowing entirely')
  console.log('    3. Or freeze the WETH reserve')
  console.log()

  // Check testnet USDC ownership
  console.log('='.repeat(80))
  console.log('TESTNET USDC OWNERSHIP')
  console.log('='.repeat(80))
  console.log()

  console.log(`USDC Address: ${USDC_ADDRESS}`)
  console.log()

  let usdcOwner: string | null = null
  try {
    usdcOwner = await client.readContract({ address: USDC_ADDRESS, abi: TESTNET_TOKEN_ABI, functionName: 'owner' })
    console.log(`  Owner: ${usdcOwner}`)
  } catch {
    console.log('  Owner: (no owner function)')
  }

  // Check if it's the same as Aave admin
  if (usdcOwner && aclAdmin) {
    if (usdcOwner.toLowerCase() === (aclAdmin as string).toLowerCase()) {
      console.log('  ⚠️  USDC owner is the SAME as Aave ACL Admin!')
      console.log('  This suggests Aave deployed this testnet USDC.')
    }
  }

  // Try to find mint-related functions in bytecode
  console.log()
  console.log('Checking USDC contract bytecode for mint functions...')
  const bytecode = await client.getCode({ address: USDC_ADDRESS })

  // Common function selectors
  const functionSignatures: Record<string, string> = {
    '40c10f19': 'mint(address,uint256)',
    'a0712d68': 'mint(uint256)',
    '6a627842': 'mint(address)',
    '4e6ec247': 'mint(address,uint256) [alt]',
    '156e29f6': 'mint(address,uint256,uint256)',
    '1249c58b': 'mint()',
    'd0e30db0': 'deposit()',
  }

  console.log()
  console.log('Function selectors found in bytecode:')
  for (const [selector, name] of Object.entries(functionSignatures)) {
    if (bytecode?.toLowerCase().includes(selector.toLowerCase())) {
      console.log(`  ✅ ${selector} -> ${name}`)
    }
  }

  console.log()
  console.log('='.repeat(80))
  console.log('RECOMMENDED ACTIONS FOR OPTIMISM')
  console.log('='.repeat(80))
  console.log()

  console.log('1. CONTACT AAVE TEAM:')
  console.log('   - Ask them to set WETH borrow cap to 0 or very low')
  console.log('   - Function: PoolConfigurator.setBorrowCap(WETH, 0)')
  console.log(`   - Pool Configurator: ${poolConfigurator}`)
  console.log(`   - ACL Admin who can do this: ${aclAdmin}`)
  console.log()
  console.log('2. ALTERNATIVE - DISABLE WETH BORROWING:')
  console.log('   - PoolConfigurator.setReserveBorrowing(WETH, false)')
  console.log('   - This completely prevents any new WETH borrows')
  console.log()
  console.log('3. FOR USDC SUPPLY:')
  console.log('   - This testnet USDC was deployed by Aave (likely)')
  console.log(`   - Owner: ${usdcOwner}`)
  console.log('   - Ask Aave if they can mint you testnet USDC')
  console.log('   - Or find a faucet for this specific token')

  // Check etherscan for more info
  console.log()
  console.log('USEFUL LINKS:')
  console.log('-'.repeat(50))
  console.log(`  USDC Contract: https://sepolia-optimism.etherscan.io/address/${USDC_ADDRESS}`)
  console.log(`  ACL Admin: https://sepolia-optimism.etherscan.io/address/${aclAdmin}`)
  console.log(`  Pool Configurator: https://sepolia-optimism.etherscan.io/address/${poolConfigurator}`)
}

main().catch(console.error)
