import type { Address } from 'viem'

/**
 * Creates a mock Morpho vault for testing
 */
export function createMockMorphoVault() {
  return {
    totalAssets: BigInt(10000000e6),
    totalSupply: BigInt(10000000e6),
    fee: BigInt(1e17),
    owner: '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0' as Address,
    curator: '0x9E33faAE38ff641094fa68c65c2cE600b3410585' as Address,
    allocations: new Map([
      [
        '0',
        {
          position: {
            supplyShares: BigInt(1000000e6),
            supplyAssets: BigInt(1000000e6),
            market: {
              supplyApy: BigInt(3e16),
            },
          },
        },
      ],
    ]),
  }
}
