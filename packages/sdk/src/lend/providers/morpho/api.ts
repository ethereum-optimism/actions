import type { Address } from 'viem'

import type { SUPPORTED_TOKENS } from '../../../supported/tokens.js'

const MORPHO_API_ENDPOINT = 'https://api.morpho.org/graphql'

// Create dynamic type based on supported tokens
type SupportedTokenRewards = {
  [K in keyof typeof SUPPORTED_TOKENS as Lowercase<K>]: number
}

export interface RewardsBreakdown extends SupportedTokenRewards {
  other: number
  totalRewardsApr: number
}

/**
 * Fetch raw vault rewards data from Morpho GraphQL API
 * @param vaultAddress - Vault address
 * @returns Promise resolving to raw vault data or null if not found
 */
export async function fetchRewards(vaultAddress: Address): Promise<any | null> {
  const vaultQuery = {
    query: `
      query VaultByAddress($address: String!, $chainId: Int) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          state {
            rewards {
              asset {
                address
                name
              }
              amountPerSuppliedToken
              supplyApr
            }
            allocation {
              market {
                uniqueKey
                state {
                  rewards {
                    supplyApr
                    amountPerSuppliedToken
                    asset {
                      address
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
      chainId: 130,
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

    const vaultData = (await response.json()) as any
    return vaultData.data?.vaultByAddress || null
  } catch (apiError) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch rewards from GraphQL API:', apiError)
    return null
  }
}
