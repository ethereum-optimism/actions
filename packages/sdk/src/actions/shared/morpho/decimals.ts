import { type Address, erc20Abi, erc4626Abi, type PublicClient } from 'viem'

/**
 * Inputs for `resolveUnderlyingDecimals`.
 */
export interface ResolveUnderlyingDecimalsParams {
  /** Public client targeting the chain where `vaultAddress` lives */
  publicClient: PublicClient
  /** ERC-4626 vault address whose underlying decimals are needed */
  vaultAddress: Address
  /**
   * Decimals from an allowlisted config (free, no RPC). Pass `undefined`
   * when no allowlist entry exists — the helper will fall back to two
   * on-chain reads (`vault.asset()` → `underlying.decimals()`).
   */
  allowlistDecimals?: number
}

/**
 * Resolve the underlying ERC-20 decimals of an ERC-4626 vault.
 * @description Prefers an allowlisted decimals value when one is available
 * (no RPC). Falls back to reading `asset()` from the vault and
 * `decimals()` from the underlying token when the caller's allowlist
 * doesn't cover the vault. Designed so both lend (vault = market address)
 * and borrow (vault = `MarketParams.collateralToken` when the collateral is
 * a yield-bearing receipt) can call it without coupling to either
 * namespace's config types.
 * @param params - Resolver inputs
 * @returns Underlying ERC-20 decimals
 */
export async function resolveUnderlyingDecimals(
  params: ResolveUnderlyingDecimalsParams,
): Promise<number> {
  if (params.allowlistDecimals !== undefined) {
    return params.allowlistDecimals
  }

  const underlying = await params.publicClient.readContract({
    address: params.vaultAddress,
    abi: erc4626Abi,
    functionName: 'asset',
  })
  return params.publicClient.readContract({
    address: underlying,
    abi: erc20Abi,
    functionName: 'decimals',
  })
}
