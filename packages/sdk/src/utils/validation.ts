import type { Address } from 'viem'
import { isAddress } from 'viem'

import {
  SUPPORTED_CHAIN_IDS,
  type SupportedChainId,
} from '@/constants/supportedChains.js'
import {
  AmountRequiredError,
  AssetNotSupportedOnChainError,
  ChainNotSupportedError,
  ConflictingAmountsError,
  InvalidAmountError,
  InvalidParamsError,
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
  if (amount !== undefined && amount <= 0) {
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

export function validateSlippage(slippage: number, maxSlippage: number): void {
  if (slippage < 0 || slippage > maxSlippage) {
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
 * Guard for `BalanceFetchOptions`. Verifies a caller-supplied `chainIds` filter is non-empty and each id is a member of `chainManager.getSupportedChains()`. No-op when `chainIds` is omitted.
 * @throws InvalidParamsError when `chainIds` is `[]`.
 * @throws ChainNotSupportedError when any id is not configured on the manager.
 */
export function validateBalanceFetchOptions(
  options: BalanceFetchOptions | undefined,
  chainManager: ChainManager,
): void {
  if (options?.chainIds === undefined) return
  if (options.chainIds.length === 0) {
    throw new InvalidParamsError({
      param: 'chainIds',
      expected: 'SupportedChainId[] (non-empty)',
      received: '[]',
    })
  }
  const supported = chainManager.getSupportedChains()
  for (const id of options.chainIds) validateChainSupported(id, supported)
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
