import type { Address } from 'viem'

/**
 * API response types for actions-service endpoints
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
 * Response from GET /wallet endpoint
 */
export interface GetWalletResponse {
  /** Wallet address */
  address: Address
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
