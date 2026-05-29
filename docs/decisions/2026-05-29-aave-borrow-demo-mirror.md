# Aave Borrow Demo Mirror Accounting

Status: Accepted, with one open policy question
Date: 2026-05-29

## Context and Problem Statement

The Actions SDK borrow domain currently supports Morpho Blue. Morpho works well
for the demo because the repo can deploy isolated demo markets with demo assets
such as `USDC_DEMO` and `OP_DEMO`.

Aave V3 is a shared pool with protocol-managed reserves. We cannot add arbitrary
demo assets as Aave reserves on Base Sepolia. That means an end-to-end Aave
borrow demo must use real Aave testnet reserves rather than the repo's custom
demo tokens.

The demo still needs to keep the rest of the app's demo economy coherent. Today
the frontend, faucet, swap, lend, and balance surfaces use demo tokens,
especially `USDC_DEMO`. If Aave borrow returns only real USDC, the demo balance
story diverges from the user-visible flow.

## Decision

Implement the SDK `AaveBorrowProvider` as a real Aave integration only:

- Collateral: real Base Sepolia ETH through Aave's ETH or WETH path.
- Debt asset: real Base Sepolia USDC from Aave.
- Health, collateral, debt, borrow, repay, and withdraw semantics come from
  Aave V3.
- No demo-token minting, burning, fake balance adjustment, or UI emulation lives
  inside the SDK provider.

Add demo-only mirror accounting in the backend:

- After a successful Aave borrow transaction, asynchronously mint `USDC_DEMO` to
  the user's demo wallet for the borrowed amount.
- After a successful Aave repay transaction, asynchronously burn `USDC_DEMO` from
  the user's demo wallet for the repaid amount.
- The API returns success after the real Aave transaction succeeds. It does not
  wait for the mirror mint or burn.
- Mirror mint and burn jobs run in the background with retry and reconciliation.
- Mirror side effects are not shown as user-facing activity items, toasts, or
  extra explorer links.
- Mirror side effects may be visible to operators through logs, metrics, tests,
  and reconciliation tooling.

This is a demo adapter, not protocol behavior. Code and docs must describe it as
mirror accounting, not as Aave returning or accepting `USDC_DEMO`.

## Requirements and Constraints

- The SDK provider must remain protocol-accurate and reusable outside the demo.
- Aave borrow support must work end to end across SDK, backend, and frontend.
- The demo must use real Aave reserves because Aave cannot be configured with
  arbitrary repo demo assets.
- User-visible success is bounded by the real Aave transaction, not by mirror
  accounting.
- Mirror reconciliation must not leak into the primary user flow.
- Operator-visible observability must exist so failed mirror operations can be
  retried or repaired.
- The frontend must avoid implying that `USDC_DEMO` is the actual Aave debt
  asset.

## Proposed Flow

### Borrow

1. User supplies real ETH collateral to Aave.
2. User borrows real USDC from Aave.
3. Backend returns success once the real Aave transaction is confirmed.
4. Backend enqueues a mirror job to mint matching `USDC_DEMO`.
5. Frontend updates from the real borrow receipt and regular balance refreshes.

### Repay

1. User repays real USDC debt to Aave.
2. Backend returns success once the real Aave transaction is confirmed.
3. Backend enqueues a mirror job to burn matching `USDC_DEMO`.
4. Reconciliation handles retryable mirror failures in the background.

## Alternatives Considered

### Put demo mint and burn inside `AaveBorrowProvider`

Rejected. The SDK provider would no longer model Aave accurately, and consumers
outside the demo would inherit demo-only side effects.

### Build a fake or emulated Aave market for demo tokens

Rejected. This preserves the demo-token story but loses the value of testing and
showing a real Aave integration.

### Surface mirror transactions in the UI

Rejected. The mirror is an implementation detail for demo accounting. Showing it
as a separate user action would confuse the user about which transaction is the
real protocol action.

### Wait for mirror mint or burn before returning API success

Rejected. User-visible success should reflect the real Aave transaction. Mirror
accounting is async reconciliation and must not block the primary protocol
operation.

## Open Question

Repay mirror burn behavior is not finalized:

- If the user no longer has enough `USDC_DEMO` to burn because they spent,
  swapped, or lent the mirrored balance, should the backend still allow the real
  Aave repay to succeed and record reconciliation debt?
- Or should the demo prevent repay unless enough mirrored `USDC_DEMO` is
  available to burn?

Default implementation should not be started until this policy is chosen.

## Implementation Notes

- Backend mirror accounting belongs in demo backend services, not SDK provider
  code.
- Mirror jobs should be idempotent against transaction hash plus action type.
- Logs and metrics should include the real Aave transaction hash, wallet address,
  amount, action type, and mirror job status.
- Tests should cover that borrow and repay responses return based on real Aave
  success and do not wait for mirror completion.
- Tests should cover mirror retry and reconciliation behavior independently from
  the SDK provider.
