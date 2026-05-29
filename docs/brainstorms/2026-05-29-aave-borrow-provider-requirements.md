# Aave Borrow Provider: Requirements

Status: Ready for planning
Date: 2026-05-29
Issue: #468 (Borrow: AaveBorrowProvider end-to-end)
Supersedes the chain assumption in `docs/decisions/2026-05-29-aave-borrow-demo-mirror.md` (Base Sepolia), which this doc revises to OP Sepolia for the real Aave leg.

## Problem

The borrow domain ships with Morpho Blue only. Morpho works for the demo because we can deploy isolated demo markets with demo assets (`USDC_DEMO`, `OP_DEMO`). Aave V3 is a shared, protocol-managed pool: we cannot add arbitrary demo reserves. An end-to-end Aave borrow demo must therefore use real Aave testnet reserves, while keeping the rest of the demo economy (which runs on demo tokens) coherent.

## Goal

Add `AaveBorrowProvider` as a first-class borrow provider, working end to end through the SDK, demo backend, and demo frontend, parallel to Morpho. The SDK provider must be an honest, reusable, real-Aave-only integration. The demo keeps its balance story coherent through mirror accounting that lives entirely in the demo layer.

## Core mechanic: the two-ledger model

The borrowed asset exists as two separate balances on two chains, and they intentionally drift apart:

| Ledger | Lives on | Changes when | Role |
|---|---|---|---|
| Real USDC (the actual borrow) | OP Sepolia, user's real wallet | real Aave borrow / repay only | protocol truth; what real Aave enforces collateral and health against |
| Demo USDC (`USDC_DEMO` mirror) | Base Sepolia | minted on borrow, burned on repay, and freely spent by the user | demo truth; what the user sees and uses across swap / lend / send |

The demo directs the user to spend `USDC_DEMO` on Base Sepolia, so the real borrowed USDC sits parked and untouched on OP Sepolia. After borrowing 100, a user might hold 100 real USDC (parked) but only 30 `USDC_DEMO` (spent 70).

Rules that follow:

1. Repay capacity is answered by `USDC_DEMO`, not the parked real USDC. If the user spent it down, they must re-acquire `USDC_DEMO` to repay. The parked real USDC is invisible to the UX.
2. The real repay is slaved to the demo burn: burn N `USDC_DEMO`, then execute a real Aave repay of N (funded by the parked real USDC). Real borrow amount equals mint amount. This keeps `real debt == mirror debt` at all times.
3. Health factor, displayed debt, liquidation price, and withdraw-collateral gating are computed from the mirror debt. Only the collateral side (ETH) is read live from real Aave. The mirror ledger is authoritative for everything the user sees.
4. Consequence: ETH collateral is locked behind the debt until repaid, and spending borrowed `USDC_DEMO` is a real commitment. The parked real USDC never bails the user out.

## Key decisions

- Real Aave V3 borrow and repay run on OP Sepolia, reusing the existing `AaveETH` lend market (`packages/demo/backend/src/config/markets.ts`) and the existing OP Sepolia ETH faucet (`packages/demo/backend/src/services/faucet.ts`). Collateral is real ETH; debt is real USDC.
- Demo mirror mint/burn of `USDC_DEMO` happens on Base Sepolia via a backend admin minter (the `USDC_DEMO` mint authority, see `mintableErc20Abi`). It is silent: no activity-log entry, toast, or extra explorer link. Operator-visible via logs/metrics only.
- The SDK `AaveBorrowProvider` is pure, real-Aave-only, and reusable. It contains zero mirror, demo, mint, burn, or balance-emulation logic.
- Mirror accounting lives in a single shared demo module, consumed by both frontend-wallet and backend-wallet flows. It is never duplicated across the two wallet paths.
- The mirror mint/burn is always a backend admin action regardless of wallet type. The real Aave transaction is signed by whichever wallet type the user has (frontend or backend wallet).

## Scope

### SDK (`packages/sdk/src/actions/borrow/`)
- Extend `BorrowMarketId` and `BorrowMarketConfig` with an `aave-v3` variant (today both are hardcoded to `kind: 'morpho-blue'` in `packages/sdk/src/types/borrow/market.ts`).
- Implement `AaveBorrowProvider` extending the existing `BorrowProvider` base class, implementing all `_*` hooks: getMarket(s), getPosition, openPosition, closePosition, depositCollateral, withdrawCollateral, repay.
- Register `aave` in borrow provider names / config and export from public SDK entry points.
- Reuse or hoist shared Aave pieces from `AaveLendProvider` (`packages/sdk/src/actions/lend/providers/aave/`): addresses, Pool ABI, reserve metadata, WETH/native ETH handling, account/health reads.
- Map Aave reserve and account data onto the generic borrow types. An Aave "market" is modeled as a synthetic (collateral asset, debt asset) pair.

### Demo backend (`packages/demo/backend/`)
- Add Aave borrow market config (OP Sepolia, ETH collateral / USDC debt) and wire `borrow.aave` into actions config.
- Implement the single shared mirror module: mint on borrow, burn on repay, lockstep with the real Aave tx, and the demo-ledger overlay (mirror debt, demo-USDC-gated repay/withdraw).
- Ensure existing borrow routes (`/borrow/markets`, `/borrow/market`, `/borrow/quote`, `/wallet/borrow/*`) work for both `morpho` and `aave` providers.
- Tests: provider routing plus at least one Aave market/position path, and the mirror lockstep and gating behavior independent of the SDK provider.

### Demo frontend (`packages/demo/frontend/`)
- Show the Aave borrow market alongside Morpho. Render Aave provider metadata and logo (assets already present: `public/aave-logo.svg`, etc.).
- Borrow, repay, deposit collateral, withdraw collateral flows render accurate quote previews driven by the mirror ledger.
- Health factor, LTV, liquidation price, borrow APY, and risk warnings computed from the mirror debt and the live collateral read.
- Gate repay and withdraw against the `USDC_DEMO` balance, surfacing the "re-acquire `USDC_DEMO` to repay" path.
- Tests: market selection, Aave position rendering, quote/submit state transitions.

### Price feeds
- `USDC_DEMO` priced at a fixed $1.
- ETH collateral value priced for display (Aave oracle read or a `MockChainlinkFeed`), recorded in deployments state if a mock feed is deployed.

## Non-goals

- Borrow CLI support (#469).
- Aave v4 (#251).
- Adding arbitrary new Aave reserves on testnet.
- E-mode, isolation mode, stable-rate borrowing.
- Surfacing the mirror mint/burn as user-facing activity.

## Assumptions (validate during planning)

- Variable-rate debt only for v1.
- Real Aave V3 on OP Sepolia has a borrowable USDC reserve with enough testnet liquidity for the demo amounts.
- The OP Sepolia ETH faucet drips enough ETH to supply meaningful collateral and borrow a demo-sized USDC amount.
- `USDC_DEMO` on Base Sepolia is mintable and burnable by a backend-held admin key.
- The synthetic single-pair model is acceptable: Aave's aggregate `getUserAccountData` is treated as this position because the demo constrains the user to ETH collateral + USDC debt.

## Success criteria

- `AaveBorrowProvider` exists, is exported, registered, and contains no demo/mirror logic.
- SDK and wallet borrow namespaces route to Aave by provider/market id.
- Unit tests cover Aave market reads, position reads, quote construction, calldata, approvals, and max repay/withdraw semantics.
- Demo backend lists, quotes, and submits Aave borrow actions through existing routes, for both wallet types.
- Demo frontend displays the Aave market and position and runs borrow/repay/collateral flows, with health and gating driven by the mirror ledger.
- Mirror logic exists in exactly one place and is exercised by both wallet paths.
- Existing Morpho borrow flows still pass and remain available.
