# Pin and integrity-test vendored router/factory/poolManager addresses

> AUGMENT existing issue #328 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| | |
|---|---|
| **Severity** | low |
| **Complexity** | 2 (1-5) |
| **Domain** | infra |
| **Surface** | uniswap/velodrome `addresses.ts`; smart-wallet factory address + ABI constants; Aave `marketId` hashing |
| **Resolves findings** | F154, F172, F104 |
| **Candidate existing issue** | #328 |
| **Blocked by** | (none) |

## Problem

Several third-party contract addresses and ABIs are vendored into the SDK as bare literals and then become the exact targets the user signs against. They carry weak or no pinned-source provenance and no integrity test, so a one-character edit (accidental copy-paste slip or a malicious diff) reroutes a signed transaction with nothing in CI to trip:

- **The Uniswap V4 / Velodrome / Aerodrome address maps are the signed `execute()` target and the Permit2 spend target.** `UNISWAP_ADDRESSES` (universalRouter, poolManager, positionManager, quoter per chain) and the Velodrome/Aerodrome per-chain router/factory maps are hardcoded address literals baked verbatim into the router calldata the user signs. The `universalRouter` / Velodrome router is the contract granted the Permit2 allowance and the `execute()` target. A wrong literal moves both the swap target and the token-spend approval to an attacker contract.
- **The Coinbase smart-wallet factory address + full ABI are the trust root for deterministic deploy and owner-management signing.** `smartWalletFactoryAddress` plus the vendored `smartWalletAbi` / `smartWalletFactoryAbi` are the source for `createAccount` / `getAddress` (deterministic address derivation + deployment) and for `addOwner` / `removeOwner` UserOp encodings. A wrong factory address derives or deploys to an attacker-influenceable address; a drifted ABI entry (e.g. argument order on an owner-management call) mis-encodes a signed owner-management operation.
- **The Aave synthetic `marketId` is hashed from un-normalized addresses with no paired verify helper.** `computeAaveBorrowMarketId` keccaks the raw reserve addresses with no `getAddress`/`isAddress` canonicalization, so the same constant pair entered with different casing produces a different `marketId`, desyncing allowlist matching from the calldata it is supposed to pin. There is no exported `verifyAaveMarketId` to pair with the Morpho sibling.

Fund-safety framing: these are vendored-constant provenance and signing-path-integrity gaps. The SDK already knows the authoritative values (they ship in-repo), so it can fail closed on drift instead of trusting whatever literal happens to be in the file. Severity is low because these are hygiene/tripwire gaps on developer-controlled constants, not an attacker runtime argument, but the constants sit directly on the signing path. RPC trust is explicitly out of scope (integrators bring their own RPC, a documented assumption).

## Findings

- **F154** (low/info) - `packages/sdk/src/actions/swap/providers/uniswap/addresses.ts:30-114`; `packages/sdk/src/actions/swap/providers/velodrome/addresses.ts:1-107` - Vendored router/poolManager/factory addresses that become the signed `execute()` target and Permit2 spend target are hardcoded with weak/no pinned-source provenance (uniswap carries only an unversioned `@see docs.uniswap.org/...` link at line 30; velodrome has only `@see velodrome.finance/docs` / `aerodrome.finance/docs` at lines 64-65, no deployment-registry pin) and no test asserting the literals match an authoritative registry, so a one-char edit reroutes a signed swap with no CI tripwire.
- **F172** (low/info) - `packages/sdk/src/wallet/core/wallets/smart/default/constants/index.ts:1-482` - The hardcoded Coinbase `smartWalletFactoryAddress` (`0xBA5ED110...85842`, line 1-2) plus the full vendored `smartWalletAbi` (line 4) and `smartWalletFactoryAbi` (line 407) - the trust root consumed by `DefaultSmartWallet` `createAccount` (DefaultSmartWallet.ts:475-485) and `getAddress` (DefaultSmartWallet.ts:573-585) and the owner-management encodings - have no upstream-commit provenance pin and no per-chain on-chain integrity test, so a drifted ABI/address mis-encodes or mis-derives a signed operation.
- **F104** (low/info) - `packages/sdk/src/actions/borrow/providers/aave/marketId.ts:14-25` - `computeAaveBorrowMarketId` hashes the raw `collateralAddress`/`debtAddress` with no `getAddress`/`isAddress` normalization, and there is no exported `verifyAaveMarketId` helper to pair with the Morpho one, so casing differences silently desync the synthetic `marketId` from the reserves it is meant to pin (the canonicalization angle on the same vendored-constant-integrity theme; the constructor-bind consumption is tracked in `borrow-marketid-calldata-bind` / #334).

## Root cause

Third-party contract addresses and ABIs were vendored as bare literals for a lean runtime closure (a good attack-surface reduction) but treated as ordinary configuration rather than as security-critical constants on the signing path. There is no recorded source-of-truth (upstream repo + commit/tag the values were generated from) and no checked-in fixture or on-chain assertion to detect drift, so any single-character change to a signed target survives type-check, lint, and the existing tests. The Aave `marketId` shares the theme: the hash that is supposed to pin the reserves is computed from un-canonicalized inputs and has no paired verify helper, so the pin can silently disagree with itself.

## Recommended approach

All three are pin + tripwire work, low-risk and additive, no architectural refactor.

1. **Provenance pins (F154, F172).** Add a source-of-truth header comment to each vendored block recording the upstream repo and the commit/tag/deployment-registry version the addresses and ABIs were generated from: the Uniswap V4 deployment registry, the Velodrome/Aerodrome deployment source, and the `coinbase/smart-wallet` commit for the factory address + ABI. Pin to an immutable reference (commit hash or on-chain-verified snapshot), not a floating docs link.

2. **Registry-match integrity test (F154).** Check in a registry fixture (the authoritative per-chain deployment addresses) and add a test asserting the vendored `UNISWAP_ADDRESSES` and Velodrome/Aerodrome literals match it, so an accidental or malicious single-character address change fails CI. Treat `universalRouter` / Velodrome router and the Permit2 spend target as security-critical constants.

3. **Per-chain factory integrity test (F172).** Add a test asserting known-bytecode/known-deployment exists at `smartWalletFactoryAddress` on each `SupportedChainId` (or, if a live-RPC test is undesirable in CI, assert against a checked-in per-chain expected-deployment fixture and document the cross-chain-identical-deployment assumption explicitly). Optionally assert the vendored ABI's owner-management entries against the upstream ABI snapshot.

4. **Aave canonicalization + verify helper (F104).** Run `getAddress()` on both reserve inputs inside `computeAaveBorrowMarketId` before hashing so casing cannot desync the pin, and add an exported `verifyAaveMarketId(marketId, { chainId, collateralAddress, debtAddress })` mirroring `verifyMorphoMarketId` (case-insensitive). Note: the construction-time consumption of `verifyAaveMarketId` in `AaveBorrowProvider` is the F103/F104 bind tracked under `borrow-marketid-calldata-bind` (#334); this ticket covers the canonicalization + helper, and the two tickets should land coherently.

Live-RPC concern: the per-chain bytecode assertion (step 3) and any registry-match that hits the network should run against a checked-in fixture or a CI-gated network job, not a per-build live call, so the test stays deterministic and does not introduce RPC trust into the runtime path (integrators bring their own RPC; that remains a documented assumption, not a runtime check).

## Affected files

- `packages/sdk/src/actions/swap/providers/uniswap/addresses.ts:30-114` - provenance pin + registry-match fixture/test (F154)
- `packages/sdk/src/actions/swap/providers/velodrome/addresses.ts:1-107` - provenance pin + registry-match fixture/test (F154)
- `packages/sdk/src/wallet/core/wallets/smart/default/constants/index.ts:1-482` - source-of-truth comment for `smartWalletFactoryAddress` (line 1), `smartWalletAbi` (line 4), `smartWalletFactoryAbi` (line 407); per-chain factory integrity test (F172)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:475-485,573-585` - consumers of `smartWalletFactoryAddress` for `createAccount`/`getAddress` (context for the F172 test)
- `packages/sdk/src/actions/borrow/providers/aave/marketId.ts:14-25` - `getAddress` normalization + new `verifyAaveMarketId` helper (F104)
- `packages/sdk/src/actions/borrow/providers/aave/index.ts` - export the new `verifyAaveMarketId` (F104)

## Acceptance criteria / tests

- Each vendored block (Uniswap addresses, Velodrome/Aerodrome addresses, smart-wallet factory address + ABIs) carries a source-of-truth comment naming the upstream repo and an immutable commit/tag/registry version.
- A registry-match test fails when any `UNISWAP_ADDRESSES` or Velodrome/Aerodrome router/factory literal is changed by a single character (verified by deliberately mutating one literal and confirming the test goes red).
- A per-chain integrity test asserts the expected smart-wallet factory deployment at `smartWalletFactoryAddress` for each `SupportedChainId` (against a checked-in fixture or a CI-gated network job), and fails if the address constant is altered.
- `computeAaveBorrowMarketId` produces the identical `marketId` for the same reserve pair regardless of input casing (lowercased vs checksummed); a test pins this.
- `verifyAaveMarketId` is exported and returns true for a matching `(chainId, collateral, debt)` triple and false for a mismatched one, mirroring `verifyMorphoMarketId`.
- Existing swap, smart-wallet, and borrow tests remain green; `typecheck`, `lint`, and `build` pass.

## Notes

- Scope: missing-obvious-integrity-tripwire and fail-closed-on-drift for vendored constants the SDK already knows the authoritative value of, plus the Aave/Morpho sibling-consistency gap (`verifyAaveMarketId` parity with `verifyMorphoMarketId`). The router/factory addresses sit on the Permit2 signature spend-target path, which is in signing-path scope.
- Out of scope: RPC trust. Integrators supply their own RPC; the per-chain bytecode check is a build/CI tripwire against a fixture, not a runtime guard, and must not push live-RPC trust into the signing path.
- Coordinate with `borrow-marketid-calldata-bind` (#334): F104's `getAddress` canonicalization + `verifyAaveMarketId` helper land here; that ticket consumes `verifyAaveMarketId` at `AaveBorrowProvider` construction (F103). Land them coherently so the helper and its consumer agree.
- All three findings are low/info: hygiene and tripwire gaps on developer-controlled constants, not live bugs. The value is a CI tripwire that turns a silent one-character signing-target reroute into a failed build.
