---
date: 2026-03-17
topic: high-marketcap-assets
target_repo: actions
---

# Export High Market Cap Assets

## What We're Building

Expand the Actions SDK from a small hardcoded token list into a rich token catalog. The SDK will export ~50 popular ERC-20 asset definitions (sourced from CoinGecko top market cap on Ethereum/L2s) with verified cross-chain addresses. Developers import whichever tokens they need and pass them in their `ActionsConfig.assets.allow` list.

Simultaneously, remove the SDK's internal `SUPPORTED_TOKENS` allowlist concept. The SDK stops being the gatekeeper — the developer's `ActionsConfig` is the sole source of truth for which assets their instance supports.

## Why

SDK developers currently must hardcode every asset they need. The SDK only ships 6 tokens (ETH, WETH, USDC, MORPHO, and two demo tokens). This forces every developer to research addresses, verify cross-chain accuracy, and define `Asset` objects from scratch. Exporting a curated catalog of popular tokens makes onboarding faster and reduces the risk of address errors.

Removing the internal allowlist simplifies the SDK's architecture — there's one path for asset configuration, not two competing concepts.

## Chosen Approach

**Static constants from CoinGecko research.** One-time research using CoinGecko data to identify the top ~50 ERC-20s by market cap on Ethereum and Ethereum L2s. Hand-curate verified addresses for each supported chain (mainnet, optimism, base, unichain, worldchain + testnets where applicable). Commit as static `Asset` constants. Update via PRs when the list needs refreshing.

**Flat named exports.** Each token is a top-level named export (`import { DAI, WBTC, LINK } from '@eth-optimism/actions-sdk'`). This is tree-shakeable, ergonomic, and consistent with existing ETH/WETH/USDC exports.

## Alternatives Considered

- **Build-time script** (fetches CoinGecko, generates constants): Adds tooling complexity for a list that changes slowly. Can add later if the catalog grows unwieldy.
- **Runtime fetch**: Adds network dependency and latency at SDK init. Addresses are security-sensitive and should be reviewed, not auto-fetched.
- **Grouped exports** (by category or single collection): Less ergonomic, not tree-shakeable, inconsistent with existing export style.

## Key Decisions

- **Remove `SUPPORTED_TOKENS` internal allowlist**: The SDK no longer filters tokens internally. `ActionsConfig.assets.allow` is the sole source of truth. The `getSupportedAssets()` method and related filtering logic are removed or simplified.
- **Developers can define custom tokens**: The `Asset` type remains public. Developers can create their own `Asset` objects and pass them in config alongside or instead of SDK-provided ones.
- **Keep demo tokens**: USDC_DEMO and OP_DEMO stay as exports for the demo app.
- **Top ~50 by market cap**: Sourced from CoinGecko for tokens on Ethereum or Ethereum L2s. Each token needs verified addresses on every supported chain where it exists.
- **Static data, manually maintained**: No runtime or build-time fetching. PRs to update the list as needed.

## Success Criteria

- SDK exports ~50 popular token `Asset` definitions with accurate cross-chain addresses
- `SUPPORTED_TOKENS` internal allowlist concept is removed
- `ActionsConfig.assets.allow` is the sole mechanism for configuring which tokens an instance supports
- Developers can still define and pass custom `Asset` objects
- Demo tokens remain exported
- Existing tests updated to reflect the new architecture
- All addresses verified against CoinGecko / block explorers

## Resolved Questions

- **`AssetsConfig.block` stays**: The blocklist concept remains because runtime fetching of assets is planned for the future. Blocklist lets developers exclude specific tokens from a dynamically-fetched set.
- **Canonical bridges only**: Only include addresses from official/canonical bridge deployments. Comment on and flag popular third-party bridged versions in the code so developers are aware they exist.
- **Single file**: One `assets.ts` file with all ~50 tokens. No need to split.

## Open Questions

- None — ready for planning.
