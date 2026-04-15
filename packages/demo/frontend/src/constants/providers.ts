/** Map SDK provider names to display names per chain */
export const PROVIDER_DISPLAY_NAME: Record<string, Record<number, string>> = {
  velodrome: {
    8453: 'Aerodrome', // Base mainnet
    84532: 'Aerodrome', // Base Sepolia
  },
}

/** Get display name for a swap provider, accounting for chain-specific branding */
export function getProviderDisplayName(
  provider: string,
  chainId?: number,
): string {
  const chainMap = PROVIDER_DISPLAY_NAME[provider]
  if (chainMap && chainId && chainMap[chainId]) {
    return chainMap[chainId]
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1)
}
