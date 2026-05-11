import type { BorrowMarketId } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

/**
 * Read-side service params for the wallet borrow position endpoint.
 * Service-layer mutation param types live next to the service functions
 * in `services/borrow.ts` (each verb has its own discriminated union).
 */
export interface BorrowPositionServiceParams {
  marketId: BorrowMarketId
  walletAddress: Address
}
