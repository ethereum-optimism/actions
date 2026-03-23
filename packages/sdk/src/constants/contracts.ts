import type { Address } from 'viem'
import { getAddress } from 'viem'

/** Permit2 is deployed to the same address on all chains */
export const PERMIT2_ADDRESS: Address = getAddress(
  '0x000000000022D473030F116dDEE9F6B43aC78BA3',
)
