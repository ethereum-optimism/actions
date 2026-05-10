import { parseAbi } from 'viem'

/**
 * Aave Pool ABI - supply and withdraw functions
 */
export const POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
])

/**
 * Aave Pool ABI - getReserveData for fetching reserve info including aToken addresses
 */
export const POOL_GET_RESERVE_DATA_ABI = [
  {
    inputs: [{ name: 'asset', type: 'address', internalType: 'address' }],
    name: 'getReserveData',
    outputs: [
      {
        components: [
          { name: 'data', type: 'uint256', internalType: 'uint256' },
        ],
        name: 'configuration',
        type: 'tuple',
        internalType: 'struct DataTypes.ReserveConfigurationMap',
      },
      { name: 'liquidityIndex', type: 'uint128', internalType: 'uint128' },
      {
        name: 'currentLiquidityRate',
        type: 'uint128',
        internalType: 'uint128',
      },
      { name: 'variableBorrowIndex', type: 'uint128', internalType: 'uint128' },
      {
        name: 'currentVariableBorrowRate',
        type: 'uint128',
        internalType: 'uint128',
      },
      {
        name: 'currentStableBorrowRate',
        type: 'uint128',
        internalType: 'uint128',
      },
      { name: 'lastUpdateTimestamp', type: 'uint40', internalType: 'uint40' },
      { name: 'id', type: 'uint16', internalType: 'uint16' },
      { name: 'aTokenAddress', type: 'address', internalType: 'address' },
      {
        name: 'stableDebtTokenAddress',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'variableDebtTokenAddress',
        type: 'address',
        internalType: 'address',
      },
      {
        name: 'interestRateStrategyAddress',
        type: 'address',
        internalType: 'address',
      },
      { name: 'accruedToTreasury', type: 'uint128', internalType: 'uint128' },
      { name: 'unbacked', type: 'uint128', internalType: 'uint128' },
      {
        name: 'isolationModeTotalDebt',
        type: 'uint128',
        internalType: 'uint128',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

/**
 * Aave WETHGateway ABI - for native ETH deposits/withdrawals
 */
export const WETH_GATEWAY_ABI = parseAbi([
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable',
  'function withdrawETH(address pool, uint256 amount, address to)',
])
