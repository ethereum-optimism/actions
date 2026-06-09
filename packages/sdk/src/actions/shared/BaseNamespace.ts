import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Minimum contract a concrete provider must expose for `BaseNamespace` to
 * aggregate it. Domain providers (LendProvider, SwapProvider, BorrowProvider)
 * implement this plus their domain-specific surface.
 */
export interface NamespaceProvider {
  supportedChainIds(): readonly SupportedChainId[]
}

/**
 * Shared base for per-domain namespaces (Lend, Swap, Borrow, …).
 * @description Holds the generic `providers` registry and exposes
 * provider-enumeration + chain-union helpers every domain's namespace needs.
 * Domain-specific routing and read operations live on the concrete
 * `BaseXxxNamespace` subclass.
 */
export abstract class BaseNamespace<
  TProvider extends NamespaceProvider,
  TProviders extends Record<string, TProvider | undefined>,
> {
  constructor(protected readonly providers: TProviders) {}

  /**
   * Union of chain IDs supported by any configured provider.
   */
  supportedChainIds(): readonly SupportedChainId[] {
    const chainIds = new Set<SupportedChainId>()
    for (const provider of this.getAllProviders()) {
      for (const chainId of provider.supportedChainIds()) {
        chainIds.add(chainId)
      }
    }
    return [...chainIds]
  }

  /**
   * Enumerate every configured (non-undefined) provider.
   */
  protected getAllProviders(): TProvider[] {
    return Object.values(this.providers).filter(
      (p): p is TProvider => p !== undefined,
    )
  }
}
