/**
 * PoolKey tuple components (shared across V4 ABI definitions)
 */
const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

/**
 * V4 Quoter ABI (subset for quoting)
 * @see https://docs.uniswap.org/contracts/v4/reference/periphery/interfaces/IQuoter
 */
export const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
  {
    name: 'quoteExactOutputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

/**
 * Universal Router ABI (subset for swaps)
 * @see https://docs.uniswap.org/contracts/v4/reference/periphery/UniversalRouter
 */
export const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

/** ABI type for ExactInputSingleParams */
export const EXACT_INPUT_SINGLE_PARAMS = [
  {
    type: 'tuple',
    components: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [...POOL_KEY_COMPONENTS],
      },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountIn', type: 'uint128' },
      { name: 'amountOutMinimum', type: 'uint128' },
      { name: 'hookData', type: 'bytes' },
    ],
  },
] as const

/** ABI type for ExactOutputSingleParams */
export const EXACT_OUTPUT_SINGLE_PARAMS = [
  {
    type: 'tuple',
    components: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [...POOL_KEY_COMPONENTS],
      },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountOut', type: 'uint128' },
      { name: 'amountInMaximum', type: 'uint128' },
      { name: 'hookData', type: 'bytes' },
    ],
  },
] as const

/** ABI type for SETTLE_ALL / TAKE_ALL params */
export const CURRENCY_AMOUNT_PARAMS = [
  { type: 'address' },
  { type: 'uint256' },
] as const

/**
 * PoolManager extsload ABI — reads arbitrary storage slots via SLOAD
 * @see https://docs.uniswap.org/contracts/v4/guides/read-pool-state
 */
export const EXTSLOAD_ABI = [
  {
    name: 'extsload',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'slot', type: 'bytes32' }],
    outputs: [{ type: 'bytes32' }],
  },
] as const

/**
 * PoolKey ABI encoding type for computing PoolId
 */
export const POOL_KEY_ABI_TYPE = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const
