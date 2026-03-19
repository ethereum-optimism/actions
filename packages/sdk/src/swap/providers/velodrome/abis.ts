/**
 * Route struct components for v2 routers (Optimism, Base).
 * Includes factory address for multi-factory support.
 */
const V2_ROUTE_COMPONENTS = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'stable', type: 'bool' },
  { name: 'factory', type: 'address' },
] as const

/**
 * Route struct components for leaf routers (Relay chains).
 * Omits factory — leaf routers use a single default factory.
 */
const LEAF_ROUTE_COMPONENTS = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'stable', type: 'bool' },
] as const

/**
 * Velodrome/Aerodrome v2 Router ABI (hub chains: Optimism, Base)
 * @see https://github.com/velodrome-finance/contracts/blob/main/contracts/Router.sol
 */
export const V2_ROUTER_ABI = [
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [...V2_ROUTE_COMPONENTS],
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactETHForTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [...V2_ROUTE_COMPONENTS],
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForETH',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [...V2_ROUTE_COMPONENTS],
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [...V2_ROUTE_COMPONENTS],
      },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

/**
 * Velodrome/Aerodrome leaf Router ABI (Relay leaf chains)
 * @see https://github.com/velodrome-finance/superchain-contracts
 */
export const LEAF_ROUTER_ABI = [
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [...LEAF_ROUTE_COMPONENTS],
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactETHForTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [...LEAF_ROUTE_COMPONENTS],
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForETH',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [...LEAF_ROUTE_COMPONENTS],
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [...LEAF_ROUTE_COMPONENTS],
      },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

/**
 * Velodrome/Aerodrome Universal Router ABI
 * Uses a command-based execute() pattern for all swap operations.
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

/**
 * Velodrome/Aerodrome Pool ABI for direct quoting.
 * Used when the Universal Router is the only router available (no legacy getAmountsOut).
 */
export const POOL_ABI = [
  {
    name: 'getAmountOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'tokenIn', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const

/**
 * Velodrome/Aerodrome PoolFactory ABI for looking up pools.
 */
export const POOL_FACTORY_ABI = [
  {
    name: 'getPool',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'stable', type: 'bool' },
    ],
    outputs: [{ type: 'address' }],
  },
] as const

/** ERC20 allowance ABI for checking current approval */
export const ERC20_ALLOWANCE_ABI = [
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const

/** ERC20 approve ABI for granting token approval */
export const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const
