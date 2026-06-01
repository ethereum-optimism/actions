import { parseAbi } from 'viem'

/**
 * Aave Pool ABI - supply, withdraw, borrow, and repay functions
 */
export const POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) returns (uint256)',
])

/**
 * Aave Pool ABI - aggregate account and reserve list reads.
 * `getUserAccountData` returns position health in the pool's base currency;
 * `getReservesList` enumerates the reserve underlying addresses.
 */
export const POOL_ACCOUNT_ABI = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReservesList() view returns (address[])',
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
 * Aave PoolAddressesProvider + AaveOracle ABIs for USD-base price reads.
 * `getPriceOracle()` resolves the oracle; `getAssetPrice(asset)` returns the
 * asset price in the pool's base currency (USD, 8 decimals on Aave V3).
 */
export const ADDRESSES_PROVIDER_ABI = parseAbi([
  'function getPriceOracle() view returns (address)',
])

export const ORACLE_ABI = parseAbi([
  'function getAssetPrice(address asset) view returns (uint256)',
])

/**
 * Aave WrappedTokenGatewayV3 ABI - native ETH deposit, withdraw, borrow, repay.
 * `borrowETH` requires prior `approveDelegation` on the variable debt token;
 * `repayETH` sends the repayment as `msg.value`.
 */
export const WETH_GATEWAY_ABI = parseAbi([
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable',
  'function withdrawETH(address pool, uint256 amount, address to)',
  'function borrowETH(address pool, uint256 amount, uint256 interestRateMode, uint16 referralCode)',
  'function repayETH(address pool, uint256 amount, uint256 rateMode, address onBehalfOf) payable',
])
