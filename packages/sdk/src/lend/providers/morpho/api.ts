import type { Address } from 'viem'

const MORPHO_API_ENDPOINT = 'https://api.morpho.org/graphql'

/** Asset info returned by Morpho GraphQL rewards query */
interface MorphoRewardAsset {
  address?: string
  name?: string
  symbol?: string
  chain?: { id?: number }
}

/** Individual reward entry from the Morpho GraphQL API */
interface MorphoReward {
  asset?: MorphoRewardAsset
  amountPerSuppliedToken?: string | number
  supplyApr?: number
}

/** Market allocation entry from the Morpho GraphQL API */
interface MorphoMarketAllocation {
  market?: {
    id?: string
    uniqueKey?: string
    state?: {
      rewards?: MorphoReward[]
    }
  }
  supplyAssetsUsd?: number
}

/** Vault state from the Morpho GraphQL API */
interface MorphoVaultState {
  rewards?: MorphoReward[]
  allocation?: MorphoMarketAllocation[]
}

/** Full vault response from the Morpho GraphQL `vaultByAddress` query */
export interface MorphoVaultApiResponse {
  address?: string
  id?: string
  state?: MorphoVaultState
  chain?: { id?: number }
}

/** Parsed top-level response envelope from Morpho GraphQL */
interface MorphoGraphQLResponse {
  data?: {
    vaultByAddress?: MorphoVaultApiResponse
  }
}

export interface RewardsBreakdown {
  /** Reward APR per token, keyed by lowercase token address. 'other' for unrecognized tokens. */
  [tokenAddress: string]: number
  other: number
  totalRewards: number
}

/**
 * Fetch raw vault rewards data from Morpho GraphQL API
 * @param vaultAddress - Vault address
 * @returns Promise resolving to raw vault data or null if not found
 */
export async function fetchRewards(
  vaultAddress: Address,
  chainId: number,
): Promise<MorphoVaultApiResponse | null> {
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

    const vaultData = (await response.json()) as MorphoGraphQLResponse
    return vaultData.data?.vaultByAddress ?? null
  } catch (apiError) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch rewards from GraphQL API:', apiError)
    return null
  }
}
