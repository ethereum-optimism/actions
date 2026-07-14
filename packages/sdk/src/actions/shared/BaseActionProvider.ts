import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { ApprovalMode } from '@/types/actions.js'
import { resolveApprovalMode } from '@/utils/approve.js'
import {
  resolveSupportedChainIds,
  validateChainSupported,
} from '@/utils/validation.js'

/** Minimal provider-config shape every action provider satisfies. */
export interface BaseActionProviderConfig {
  approvalMode?: ApprovalMode
}

/** Minimal shared-settings shape every action namespace satisfies. */
export interface BaseActionSettings {
  approvalMode?: ApprovalMode
}

/**
 * Abstract base for per-action providers (Lend, Swap, Borrow, …).
 * @description Owns construction, the config getter, chain-set resolution,
 * and approval-mode cascading (per-call → provider config → shared settings).
 * Concrete domain bases (`LendProvider`, `SwapProvider`, `BorrowProvider`)
 * extend this and add their domain-specific public surface; concrete
 * providers (`MorphoLendProvider`, `UniswapSwapProvider`, …) implement the
 * protocol hooks declared on those domain bases.
 */
export abstract class BaseActionProvider<
  TConfig extends BaseActionProviderConfig,
  TSettings extends BaseActionSettings,
> {
  protected readonly _config: TConfig
  protected readonly _settings: TSettings
  protected readonly chainManager: ChainManager

  protected constructor(
    config: TConfig,
    chainManager: ChainManager,
    settings?: TSettings,
  ) {
    this._config = config
    this._settings = settings ?? ({} as TSettings)
    this.chainManager = chainManager
  }

  public get config(): TConfig {
    return this._config
  }

  /**
   * Effective supported chain IDs.
   * @description Intersection of the protocol's supported chains, the SDK's
   * supported chains, and the developer's configured chains.
   */
  public supportedChainIds(): SupportedChainId[] {
    return resolveSupportedChainIds(
      this.protocolSupportedChainIds(),
      this.chainManager.getSupportedChains(),
    )
  }

  public isChainSupported(chainId: number): boolean {
    return (this.supportedChainIds() as readonly number[]).includes(chainId)
  }

  /**
   * Assert a chain is in this provider's effective supported set, injecting
   * `supportedChainIds()` so call sites don't repeat the plumbing.
   * @throws ChainNotSupportedError when the chain is unsupported.
   */
  protected assertChainSupported(chainId: number): void {
    validateChainSupported(chainId, this.supportedChainIds())
  }

  /**
   * Resolve approval mode with provider → settings → caller-default precedence.
   */
  protected resolveApprovalMode(perCall?: ApprovalMode): ApprovalMode {
    return resolveApprovalMode(
      perCall,
      this._config.approvalMode,
      this._settings.approvalMode,
    )
  }

  /**
   * Chain IDs the underlying protocol is deployed on, before SDK-level or
   * developer-config filtering.
   */
  public abstract protocolSupportedChainIds(): number[]
}
