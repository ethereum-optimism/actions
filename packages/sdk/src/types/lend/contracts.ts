import type { Address } from 'viem'

/**
 * Morpho contract addresses needed per chain
 */
export interface MorphoContracts {
  /** Morpho Blue core contract - market state, positions, supply/withdraw */
  morphoBlue: Address
  /** Interest Rate Model contract - borrow rate calculation for APY */
  irm: Address
  /** MetaMorpho vault factory (optional, only for vault creation) */
  metaMorphoFactory?: Address
}

/**
 * Aave contract addresses needed per chain
 */
export interface AaveContracts {
  /** Aave Pool contract - supply, withdraw, borrow, repay */
  pool: Address
  /** Pool Data Provider - reserve data, APY rates, user positions */
  poolDataProvider?: Address
  /** WETH Gateway - handles native ETH wrapping */
  wethGateway?: Address
  /** Price Oracle (optional, for collateral valuation) */
  priceOracle?: Address
}

/**
 * Registry types mapping chainId to provider contracts
 */
export type MorphoContractsRegistry = Record<number, MorphoContracts>
export type AaveContractsRegistry = Record<number, AaveContracts>
