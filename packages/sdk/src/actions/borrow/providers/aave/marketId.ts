import type { Address, Hex } from 'viem'
import { encodeAbiParameters, keccak256 } from 'viem'

/**
 * Compute the synthetic Aave V3 borrow market id.
 * @description Aave is a shared multi-asset pool with no params-hash market id,
 * so a borrow "market" is identified by the (chain, collateral, debt) triple.
 * Hashing it into a 32-byte hex keeps every existing `marketId: Hex` consumer
 * (`marketIdMatches`, serializer URL paths, allowlist lookup) working unchanged.
 * Pure function; safe at config time, in tests, and at provider construction.
 * @param params - Chain id and the collateral/debt reserve underlying addresses
 * @returns The synthetic market id as a `0x`-prefixed 32-byte hex string
 */
export function computeAaveBorrowMarketId(params: {
  chainId: number
  collateralAddress: Address
  debtAddress: Address
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }],
      [BigInt(params.chainId), params.collateralAddress, params.debtAddress],
    ),
  )
}
