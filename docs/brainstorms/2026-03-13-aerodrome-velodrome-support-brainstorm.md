---
date: 2026-03-13
topic: aerodrome-velodrome-support
target_repo: actions
---

# Aerodrome & Velodrome Swap Support

## What We're Building

A new swap provider for the Actions SDK that supports Aerodrome (Base) and Velodrome (Optimism + other OP Stack chains). Since their Router interfaces are identical, a single `VelodromeSwapProvider` class handles both, parameterized by contract addresses and chain ID. v1 is swaps only — no liquidity provision.

## Why

Aerodrome and Velodrome are the dominant DEXes on Base and Optimism respectively. Adding them significantly expands the swap surface for agents operating across OP Stack chains. With Velodrome deployed on 13+ OP Stack chains, this single provider unlocks broad DEX access across the ecosystem.

## Chosen Approach

**Single provider class, direct contract interaction, all OP Stack deployments.**

- **No SDK wrapper** — No production SDK exists (`@dromos-labs/sdk.js` is alpha). Direct contract interaction via viem.
- **One provider class** — `VelodromeSwapProvider` serves both Aerodrome and Velodrome. The Router interfaces are function-for-function identical (same 26 functions, same `Route` struct, same parameter types). Only contract addresses differ.
- **All OP Stack chains from day one** — Aerodrome on Base + Velodrome on Optimism, Bob, Celo, Fraxtal, Ink, Lisk, Metal, Mode, Soneium, Superseed, Swell, Unichain.

## Alternatives Considered

- **Wrap `@dromos-labs/sdk.js`**: Rejected — alpha quality (0.3.0-alpha.3), adds fragile dependency. Direct contract interaction via viem is more reliable.
- **Separate AerodromeSwapProvider and VelodromeSwapProvider**: Rejected — Router interfaces are identical. Two classes would be pure duplication. A single class with per-chain address configs is cleaner.
- **OP Mainnet + Base only for v1**: Rejected — Velodrome OP Stack contracts are already deployed on 13 chains with the same interface. No reason to artificially limit scope when the address table is the only difference.

## Key Decisions

- **Provider name**: `VelodromeSwapProvider` (Velodrome is the original; Aerodrome is the Base fork). Config entries can be labeled `velodrome` or `aerodrome` for clarity, but one class.
- **Market config**: Pools are differentiated by a `stable: boolean` flag (stable vs volatile). Market config:
  ```typescript
  interface VelodromeMarketConfig extends SwapMarketConfig {
    stable: boolean        // stable vs volatile pool
    factory?: Address      // optional, defaults to canonical factory per chain
  }
  ```
- **Routing**: Use the Router's `swapExactTokensForTokens` / `swapExactETHForTokens` / `swapExactTokensForETH` directly. The `Route` struct (`{ from, to, stable, factory }`) handles path specification.
- **Quoting**: Use Router's `getAmountsOut(amountIn, routes)` for price quotes.
- **Approvals**: Standard ERC-20 approve to Router address.
- **Branch name**: `kevin/aero-velo-support`

## Contract Addresses (Known)

**Aerodrome (Base)**:
- Router: `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`
- PoolFactory: needs confirmation
- AERO token: `0x940181a94A35A4569E4529A3CDfB74e38FD98631`

**Velodrome (OP Mainnet)**:
- Router: `0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858`
- PoolFactory: `0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a`
- VELO token: `0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db`

**Velodrome OP Stack deployments**: Addresses for the remaining 11 chains need to be gathered from the `velodrome-finance/superchain-contracts` repo during planning.

## Success Criteria

- `VelodromeSwapProvider` has comprehensive test coverage
- Swaps work on Base (Aerodrome) and OP Mainnet (Velodrome) at minimum
- Address table covers all 13 OP Stack deployments
- Market config with `stable` flag correctly routes to stable vs volatile pools
- No new dependencies beyond viem (already in use)

## Open Questions

- Exact contract addresses for Velodrome OP Stack deployments (Bob, Celo, Fraxtal, Ink, Lisk, Metal, Mode, Soneium, Superseed, Swell, Unichain) — gather from superchain-contracts repo
- Does the OP Stack Velodrome deployment use the same Router interface, or a modified one for cross-chain operations? Needs verification.
- Fee structure: Are pool fees queryable on-chain, or do they need to be configured per-market? Affects quoting accuracy.
- Should the provider name in config be `velodrome` (covering both) or split into `velodrome` / `aerodrome` keys pointing to the same class?
