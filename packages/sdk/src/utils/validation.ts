import type { Address } from 'viem'
import { isAddress } from 'viem'

import {
  SUPPORTED_CHAIN_IDS,
  type SupportedChainId,
} from '@/constants/supportedChains.js'
import {
  AddressRequiredError,
  AmountRequiredError,
  AssetNotSupportedOnChainError,
  ChainNotSupportedError,
  ConflictingAmountsError,
  InvalidAmountError,
  InvalidParamsError,
  QuoteExpiredError,
  SameAssetError,
  SlippageOutOfRangeError,
  ZeroAddressError,
} from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset, BalanceFetchOptions } from '@/types/asset.js'
import { isAssetSupportedOnChain } from '@/utils/assets.js'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function validateAmountProvided(
  amountIn?: number,
  amountOut?: number,
): void {
  if (amountIn === undefined && amountOut === undefined) {
    throw new AmountRequiredError()
  }
}

export function validateAmountPositiveIfExists(amount?: number): void {
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    throw new InvalidAmountError(amount)
  }
}

export function validateNotBothAmounts(
  amountIn?: number,
  amountOut?: number,
): void {
  if (amountIn !== undefined && amountOut !== undefined) {
    throw new ConflictingAmountsError()
  }
}

export function validateNotSameAsset(assetIn: Asset, assetOut: Asset): void {
  if (
    assetIn.metadata.symbol.toLowerCase() ===
    assetOut.metadata.symbol.toLowerCase()
  ) {
    throw new SameAssetError(assetIn.metadata.symbol)
  }
}

export function validateNotZeroAddress(address: Address, label: string): void {
  if (address === ZERO_ADDRESS) {
    throw new ZeroAddressError(label, address)
  }
}

/**
 * Reject a value that is not a syntactically valid EVM address.
 * @throws InvalidParamsError when `isAddress` rejects the value.
 */
export function validateAddress(
  address: string,
  label: string,
): asserts address is Address {
  if (!isAddress(address)) {
    throw new InvalidParamsError({
      param: label,
      expected: 'a valid EVM address',
      received: address,
    })
  }
}

/**
 * Reject a quote whose expiration timestamp (unix seconds) has passed.
 * @throws QuoteExpiredError when expired.
 */
export function validateQuoteNotExpired(expiresAt: number): void {
  const now = Math.floor(Date.now() / 1000)
  if (now >= expiresAt) {
    throw new QuoteExpiredError({ expiresAt, currentTime: now })
  }
}

/**
 * Reject a missing, malformed, or zero-address wallet address in one call.
 * @throws AddressRequiredError when undefined/empty.
 * @throws InvalidParamsError when not a syntactically valid EVM address.
 * @throws ZeroAddressError when the zero address.
 */
export function validateWalletAddress(
  walletAddress: Address | undefined,
): asserts walletAddress is Address {
  const label = 'walletAddress'
  if (!walletAddress) {
    throw new AddressRequiredError(label)
  }
  validateAddress(walletAddress, label)
  validateNotZeroAddress(walletAddress, label)
}

/** Reject non-finite slippage and enforce both `[0, 1)` bounds and `maxSlippage`. */
export function validateSlippage(slippage: number, maxSlippage: number): void {
  if (
    !Number.isFinite(slippage) ||
    slippage < 0 ||
    slippage >= 1 ||
    slippage > maxSlippage
  ) {
    throw new SlippageOutOfRangeError(slippage, maxSlippage)
  }
}

export function validateChainSupported(
  chainId: number,
  supportedChainIds: readonly number[],
): void {
  if (!supportedChainIds.includes(chainId)) {
    throw new ChainNotSupportedError({ chainId, supportedChainIds })
  }
}

/**
 * Resolve the effective chain set for a provider instance.
 * @description Intersects protocol-native chains, SDK-supported chains, and
 * developer-configured chains while preserving the protocol's declared order.
 */
export function resolveSupportedChainIds(
  protocolSupportedChainIds: readonly number[],
  configuredChainIds: readonly number[],
): SupportedChainId[] {
  return protocolSupportedChainIds.filter(
    (chainId): chainId is SupportedChainId =>
      (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId) &&
      configuredChainIds.includes(chainId),
  )
}

/**
 * Validate an optional chain list against a supported chain set.
 * @description Accepts an omitted list, rejects an empty list, and verifies
 * every supplied ID is supported.
 * @param chainIds - Optional configured chain subset.
 * @param supportedChainIds - Chain IDs available to the caller.
 * @returns Nothing.
 * @throws InvalidParamsError when `chainIds` is `[]`.
 * @throws ChainNotSupportedError when any ID is unsupported.
 */
export function validateChainIds(
  chainIds: readonly SupportedChainId[] | undefined,
  supportedChainIds: readonly SupportedChainId[],
): void {
  if (chainIds === undefined) return
  if (chainIds.length === 0) {
    throw new InvalidParamsError({
      param: 'chainIds',
      expected: 'SupportedChainId[] (non-empty)',
      received: '[]',
    })
  }
  for (const chainId of chainIds) {
    validateChainSupported(chainId, supportedChainIds)
  }
}

/**
 * Guard for `BalanceFetchOptions` chain filters.
 * @param options - Optional balance query filters.
 * @param chainManager - Source of developer-configured chain IDs.
 * @returns Nothing.
 * @throws InvalidParamsError when `chainIds` is `[]`.
 * @throws ChainNotSupportedError when any ID is not configured.
 */
export function validateBalanceFetchOptions(
  options: BalanceFetchOptions | undefined,
  chainManager: ChainManager,
): void {
  validateChainIds(options?.chainIds, chainManager.getSupportedChains())
}

export function validateAssetOnChain(
  asset: Asset,
  chainId: SupportedChainId,
): void {
  if (!isAssetSupportedOnChain(asset, chainId)) {
    throw new AssetNotSupportedOnChainError(asset.metadata.symbol, chainId)
  }
}

/**
 * Validate that a resolved recipient address is not the zero address.
 * ENS names are skipped; only resolved `Address` values are checked.
 */
export function validateRecipient(recipient: string | undefined): void {
  if (recipient && isAddress(recipient)) {
    validateNotZeroAddress(recipient, 'recipient')
  }
}
