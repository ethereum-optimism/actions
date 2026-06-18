# Bind borrow marketId/reserves to calldata targets and verify config at construction

> AUGMENT existing issue #334 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| | |
|---|---|
| **Severity** | medium |
| **Complexity** | 4 (1-5) |
| **Domain** | borrow |
| **Surface** | `AaveBorrowProvider` constructor marketId verify; `validateConfigAddresses` skips `config.borrow`; aave/morpho `receiver=onBehalf` bind |
| **Resolves findings** | F103, F104, F083, F086, F017, F259 |
| **Candidate existing issue** | #334 |
| **Blocked by** | (none) |

## Problem

The borrow config a developer hands the SDK becomes the set of addresses baked into signed ERC-20 `approve` and Aave/Morpho write calldata. Today nothing at construction time binds that config to the calldata it routes:

- **Aave allowlist keys on `marketId`, but all Aave calldata is encoded from the raw `aave.collateralReserve`/`aave.debtReserve` fields.** The Morpho sibling closes exactly this hole with `verifyMorphoMarketId`; the Aave provider has no equivalent. A config entry whose `marketId` was derived from a legitimate (WETH, USDC) pair, but whose reserve fields were spliced to attacker tokens, passes every guard and routes borrow/supply/repay/withdraw plus the ERC-20 approval against the spliced reserves.
- **`validateConfigAddresses` - the one config-time syntactic address check - never walks `config.borrow` at all.** Its parameter type does not even accept a `borrow` field. So the Morpho `marketParams.loanToken/collateralToken/oracle/irm` and Aave `aave.debtReserve/collateralReserve` (all signed-calldata targets and approval-token addresses) are never `isAddress`/`getAddress`-validated, while lend and swap markets are. A typo'd or truncated reserve address ships straight into signed calldata.
- **Aave and Morpho both encode `onBehalf`/`receiver = walletAddress` with no conformance check** that the executing signer equals `onBehalf`. On the EOA happy path this holds, but the invariant is unstated and untested, and no `approveDelegation`/`setAuthorization` leg is required if a delegated sender is ever introduced.

Fund-safety framing: these are config-integrity and signing-path gaps. The malformed data is trusted developer allowlist config rather than an attacker runtime argument, which is why this is medium and not high, but the SDK already has every input it needs to fail closed at construction time and instead trusts the config silently.

## Findings

- **F103** (medium) - `packages/sdk/src/actions/borrow/providers/aave/AaveBorrowProvider.ts:46-54` - constructor calls only `super()` + `assertAaveMarketChainsSupported`; it never verifies `marketId == computeAaveBorrowMarketId({ chainId, collateralAddress, debtAddress })`, so a spliced-reserve allowlist entry routes calldata against attacker tokens. The Morpho sibling enforces this bind.
- **F104** (low/info) - `packages/sdk/src/actions/borrow/providers/aave/marketId.ts:14-25` - `computeAaveBorrowMarketId` hashes raw caller addresses with no `getAddress`/`isAddress` normalization, and there is no exported `verifyAaveMarketId` helper to pair with the Morpho one, which is part of why the F103 bind was never wired.
- **F259** (medium) - `packages/sdk/src/utils/validateAddresses.ts:121-153` - `validateConfigAddresses` walks only `config.lend`/`config.swap`/`config.assets`; its param type lacks a `borrow` field, so the entire `config.borrow` address surface (Morpho `loanToken/collateralToken/oracle/irm`, Aave `debtReserve/collateralReserve`, collateral/borrow asset maps) is never format-validated. Called once at `packages/sdk/src/actions.ts:86`.
- **F083** (medium) - `packages/sdk/src/actions/borrow/providers/aave/calldata.ts:19-39` - `encodeAaveBorrow` sets `onBehalfOf = walletAddress` but no SDK conformance check asserts the executing signer equals `onBehalfOf`; for `onBehalfOf != msg.sender` Aave requires credit delegation (`approveDelegation`), which the borrow surface never references.
- **F086** (low) - `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:81-97` - `encodeMorphoBorrow` (and `encodeMorphoWithdrawCollateral`) set `onBehalf` and `receiver = walletAddress`; Morpho Blue requires `msg.sender == onBehalf` or `isAuthorized(onBehalf, msg.sender)`. The signer-must-equal-onBehalf invariant is unstated and untested, with no `setAuthorization` conformance leg.
- **F017** (low) - `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:79-88` - the constructor runs `verifyMorphoMarketId` over `marketAllowlist` only; `marketBlocklist` entries are matched by id but never integrity-checked, so a blocklist entry with a garbage `marketId` silently fails to block its intended market.

## Root cause

The borrow providers were built after the lend/swap config-validation plumbing and never wired into it. `validateConfigAddresses` predates `config.borrow` and its type was never widened, so the borrow surface fell outside the one syntactic choke point. The Morpho provider grew a `verifyMorphoMarketId` bind for its allowlist; the Aave provider never got the analogous `verifyAaveMarketId` (the helper is implemented as `computeAaveBorrowMarketId` and exported, but never invoked in any validation path), and the Morpho bind was applied asymmetrically (allowlist only, not blocklist). The `onBehalf == signer` assumption is correct on the direct-EOA path but was left as an implicit invariant rather than a stated, tested conformance check.

## Recommended approach

All changes are SDK-side and config-time / encode-time. No demo or CLI changes are in scope here.

1. **Add `verifyAaveMarketId` and consume it at construction (F103, F104).** Add an exported `verifyAaveMarketId(marketId, { chainId, collateralAddress, debtAddress })` mirroring `verifyMorphoMarketId` (case-insensitive compare). Have `computeAaveBorrowMarketId` run `getAddress()` on both reserve inputs before hashing so casing differences cannot desync allowlist matching from calldata. In the `AaveBorrowProvider` constructor, loop `marketAllowlist` (kind `aave-v3`) and throw `BorrowMarketParamsMismatchError` (the same error the Morpho sibling throws) when `marketId != computeAaveBorrowMarketId({ chainId, collateralAddress: aave.collateralReserve, debtAddress: aave.debtReserve })`.

2. **Extend `validateConfigAddresses` to cover `config.borrow` (F259).** Widen the param type to accept `borrow?: BorrowConfig` and add a `borrowProviderAddresses(cfg, path)` helper mirroring `lendProviderAddresses`/`swapProviderAddresses`: for each `marketAllowlist`/`marketBlocklist` entry, emit Morpho `marketParams.loanToken/collateralToken/oracle/irm` and Aave `aave.debtReserve/collateralReserve`, plus the `collateralAsset`/`borrowAsset` address maps via the existing `assetAddresses` helper. Fix the JSDoc claim that lend/swap coverage is generic. This makes a typo'd borrow reserve fail at construction the same way a typo'd lend address already does.

3. **Apply the Morpho marketId verify to `marketBlocklist` too (F017).** In `MorphoBorrowProvider`, run `verifyMorphoMarketId` over `marketBlocklist` entries (kind `morpho-blue`) as well, removing the allowlist-vs-blocklist asymmetry so a deliberately-disabled market cannot silently fail to block on a bad `marketId`.

4. **State and test the signer-equals-onBehalf invariant (F083, F086).** Add an explicit invariant comment plus a unit test, for both Aave (`encodeAaveBorrow`) and Morpho (`encodeMorphoBorrow`/`encodeMorphoWithdrawCollateral`), that every encoded `onBehalf`/`receiver`/`onBehalfOf` leg equals the `walletAddress` threaded in. Document that delegated-sender support (`onBehalf != signer`) is out of scope today and, if introduced, must require and verify the corresponding Aave `approveDelegation` / Morpho `setAuthorization` leg in the bundle. This is a conformance assertion, not a behavior change on the EOA path.

Note on health-factor: this ticket is the marketId/reserve/onBehalf binding item, not the borrow health-factor item, so the advisory-vs-fail-closed product sign-off question does not apply here.

## Affected files

- `packages/sdk/src/actions/borrow/providers/aave/AaveBorrowProvider.ts:46-54` - constructor marketId verify (F103)
- `packages/sdk/src/actions/borrow/providers/aave/marketId.ts:14-25` - `getAddress` normalization + new `verifyAaveMarketId` (F104)
- `packages/sdk/src/utils/validateAddresses.ts:90-153` - new `borrowProviderAddresses` helper, widen `validateConfigAddresses` param/body (F259)
- `packages/sdk/src/actions.ts:86` - callsite (passes `config`, no change expected once the type is widened)
- `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:79-88` - apply verify to `marketBlocklist` (F017)
- `packages/sdk/src/actions/borrow/providers/aave/calldata.ts:19-39` - invariant comment for `onBehalfOf` (F083)
- `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:81-97` - invariant comment for `onBehalf`/`receiver` (F086)
- `packages/sdk/src/index.ts:8` - export `verifyAaveMarketId` alongside `computeAaveBorrowMarketId`

## Acceptance criteria / tests

- An `AaveBorrowProvider` constructed with an allowlist entry whose `marketId` does not match `computeAaveBorrowMarketId` of its `aave` reserves throws `BorrowMarketParamsMismatchError` at construction.
- `verifyAaveMarketId` returns true for a matching (case-insensitive) pair and false for a spliced pair; `computeAaveBorrowMarketId` produces the same id for checksummed and lowercased reserve inputs (pinned against a frozen golden hex vector so a hashing-scheme regression can fail).
- `validateConfigAddresses` throws (with a path that names the offending field) when any borrow market carries a malformed Morpho `loanToken/collateralToken/oracle/irm`, Aave `debtReserve/collateralReserve`, or asset address, in both `marketAllowlist` and `marketBlocklist`; valid borrow config passes unchanged.
- A `MorphoBorrowProvider` whose `marketBlocklist` entry has a `marketId` mismatching its `marketParams` throws at construction (parity with the allowlist).
- Encode-leg tests assert `encodeAaveBorrow` `onBehalfOf`, and `encodeMorphoBorrow`/`encodeMorphoWithdrawCollateral` `onBehalf` and `receiver`, all equal the threaded `walletAddress`.
- Tests encode why: a config-integrity test must fail if the marketId<->reserve bind or the borrow address validation is removed, not merely exercise the happy path.

## Notes

- Severity is medium because the malformed data is trusted developer allowlist config, not an attacker runtime argument; F104 and F086 are low/info and ride along because they are the missing helper and the unstated invariant behind the medium items. The fixes are fail-closed-where-the-SDK-already-knows plus sibling-provider consistency, squarely in scope.
- This brings the Aave provider to parity with the Morpho `verifyMorphoMarketId` bind and brings `config.borrow` to parity with the lend/swap address validation already in place.
- The signer-equals-onBehalf work is a stated-and-tested invariant only; supporting `onBehalf != signer` (with `approveDelegation`/`setAuthorization` legs) is explicitly deferred and not part of this ticket.
- Sibling decimal-scaling binds for the borrow path (Morpho `marketParams.collateralToken/loanToken` vs `collateralAsset/borrowAsset` decimals - ledger F260) and the pre-built-quote blocklist gap (F010-analog) are tracked separately; this ticket is the marketId/reserve/onBehalf binding and the config-time address validation.
