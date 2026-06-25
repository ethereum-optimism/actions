# Anvil e2e wave findings

This file is the shared handoff for follow-up Anvil e2e tickets. Before implementing any new standard e2e ticket, read the planning draft PR, this file, and the current helper PR, then keep the new PR focused on its one provider or wallet lane.

- Planning draft PR: [ethereum-optimism/actions#513](https://github.com/ethereum-optimism/actions/pull/513)
- Umbrella ticket: [e2e-anvil-feature-test](./e2e-anvil-feature-test.md)
- Current helper PR: [its-applekid/actions#61](https://github.com/its-applekid/actions/pull/61)
- Current EOA PR: [its-applekid/actions#60](https://github.com/its-applekid/actions/pull/60)
- Current Uniswap PR: [its-applekid/actions#62](https://github.com/its-applekid/actions/pull/62)

## Implementation shape

- Keep provider PRs small: one test file, one changeset if the SDK package changed, and only provider-specific scenario data.
- Use the shared helper branch instead of copying fork setup, wallet construction, funding, receipt waits, balance snapshots, or action runners.
- A provider test should mostly build an `ActionsConfig`, declare market or token inputs, fund the wallet, and call the shared standard runner.
- Stack dependent provider PRs on the helper branch when the helpers are still unmerged, so the PR diff does not replay helper files.
- Use public SDK APIs in e2e tests. The goal is standard user behavior, not private provider internals.
- Grep before adding helpers. Prefer existing test utilities and viem helpers over duplicate local functions.

## Review findings to preserve

- Do not fund from a protocol contract under test. Use a passive holder or a helper that seeds balances without mutating protocol state.
- Native ETH balance assertions can pass from gas spend alone. Prefer receipt/output fields, ERC-20 deltas, or gas-aware invariants.
- Keep test bodies small. Extract setup, funding, and assertion helpers when a test grows past the repo function-size guideline.
- Import shared types from their canonical homes, not through unrelated domain namespaces.
- Keep inline code comments concise and omit temporary finding IDs. Public JSDoc can include params, returns, throws, and behavior notes.
- PR descriptions should stay short: `Closes #N`, `# Problem`, and `# Solution`.

## Helper PR findings

- ERC-4337 receipts should use top-level user-op `success`; nested transaction status can be successful while the user operation failed.
- Fork configuration should be a discriminated attach/start union, not a both-optional shape.
- Runner inputs should be narrowed to the address and namespace or method they use, instead of requiring full wallet casts.
- Funding helpers need coverage for ETH-only funding, token funding, invalid addresses, reverted transfer receipts, and cleanup after failure.
- Funding duplicate token entries with the same whale must be grouped or serialized so one path cannot stop impersonation while another transfer is in flight.
- RPC helpers need tests for non-OK HTTP, JSON-RPC error payloads, malformed payloads, and valid success.
- Standard runners should cover lend close, all borrow actions, and missing namespaces.
- Fork helper files should live in the existing SDK test utility area. If the file grows past the repo file-size guideline, split an Anvil-specific utility module.

## aiur dogfood findings

- PR review comment events were emitted and consumed for issues #57, #58, and #59, but did not reliably wake the owning agent into an actionable fix turn. Tracked in [aiur#619](https://github.com/its-everdred/aiur/issues/619).
- Operator messages also did not reliably wake idle running agents. Tracked in [aiur#620](https://github.com/its-everdred/aiur/issues/620).
- Blocked follow-up agents should inspect blocker branch pushes and stack once usable helper code lands. Tracked in [aiur#618](https://github.com/its-everdred/aiur/issues/618).
- Until those bugs are fixed, operators should verify logs and branch heads directly instead of trusting status summaries alone.

## Future ticket instruction

Add this handoff to every follow-up Anvil e2e ticket:

> Before implementation, read the planning draft PR and `docs/tickets/anvil-e2e-wave-findings.md` on the `kevin/prod-readiness-review` branch. Keep this PR focused on the one e2e lane, use the shared helpers, and do not duplicate helper code from the helper PR.
