import type { Address } from 'viem'

const MORPHO_API_ENDPOINT = 'https://api.morpho.org/graphql'

export interface RewardsBreakdown {
  /** Reward APR per token, keyed by lowercase token address. 'other' for unrecognized tokens. */
  [tokenAddress: string]: number
  other: number
  totalRewards: number
}

/** Asset information from Morpho API */
interface MorphoAsset {
  address: string
  name?: string
  symbol?: string
  chain?: {
    id: number
  }
}

/** Reward information from Morpho API */
interface MorphoReward {
  asset: MorphoAsset
  amountPerSuppliedToken?: string
  supplyApr?: string
}

/** Market information from Morpho API */
interface MorphoMarket {
  id: string
  uniqueKey: string
  state?: {
    rewards?: MorphoReward[]
  }
}

/** Allocation information from Morpho API */
interface MorphoAllocation {
  market: MorphoMarket
  supplyAssetsUsd?: string
}

/** Vault state from Morpho API */
interface MorphoVaultState {
  rewards?: MorphoReward[]
  allocation?: MorphoAllocation[]
}

/** Vault data from Morpho API */
export interface MorphoVault {
  address: string
  id: string
  state?: MorphoVaultState
  chain?: {
    id: number
  }
}

/** GraphQL API response structure */
interface MorphoApiResponse {
  data?: {
    vaultByAddress?: MorphoVault
  }
  errors?: Array<{
    message: string
  }>
}

/**
 * Fetch raw vault rewards data from Morpho GraphQL API
 * @param vaultAddress - Vault address
 * @returns Promise resolving to raw vault data or null if not found
 */
export async function fetchRewards(
  vaultAddress: Address,
  chainId: number,
): Promise<MorphoVault | null> {
  const vaultQuery = {
    query: `
      query VaultByAddress($address: String!, $chainId: Int) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          id
          state {
            rewards {
              asset {
                address
                name
                symbol
                chain {
                  id
                }
              }
              amountPerSuppliedToken
              supplyApr
            }
            allocation {
              market {
                id
                uniqueKey
                state {
                  rewards {
                    supplyApr
                    amountPerSuppliedToken
                    asset {
                      address
                      symbol
                      chain {
                        id
                      }
                    }
                  }
                }
              }
              supplyAssetsUsd
            }
          }
          chain {
            id
          }
        }
      }
    `,
    variables: {
      address: vaultAddress.toLowerCase(),
      chainId,
    },
  }

  try {
    const response = await fetch(MORPHO_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(vaultQuery),
    })

    const vaultData = (await response.json()) as MorphoApiResponse
    return vaultData.data?.vaultByAddress || null
  } catch (apiError) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch rewards from GraphQL API:', apiError)
    return null
  }
}
