import type { Address } from 'viem'

/**
 * API response types for verbs-service endpoints
 * @description Shared types between SDK, service, and UI for consistent API contracts
 */

/**
 * Wallet data returned by API endpoints
 */
export interface WalletData {
  /** Wallet address */
  address: Address
  /** Wallet ID */
  id: string
}

/**
 * Response from GET /wallets endpoint
 */
export interface GetAllWalletsResponse {
  /** Array of wallet data */
  wallets: WalletData[]
  /** Total count of wallets returned */
  count: number
}

/**
 * Response from POST /wallet/:userId endpoint
 */
export interface CreateWalletResponse {
  /** Wallet address */
  privyAddress: string
  /** Smart wallet address */
  smartWalletAddress: string
  /** User ID */
  userId: string
}

/**
 * Response from GET /wallet/:userId endpoint
 */
export interface GetWalletResponse {
  /** Wallet address */
  address: Address
  /** User ID */
  userId: string
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  /** Error message */
  error: string
  /** Additional error details */
  message?: string
  /** Validation error details */
  details?: unknown
}
