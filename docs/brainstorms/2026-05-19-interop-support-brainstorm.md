---
date: 2026-05-19
topic: interop-support
related:
  - https://github.com/ethereum-optimism/ecosystem/tree/main/packages/viem/docs/actions/interop
  - https://specs.optimism.io/interop/overview.html
  - https://specs.optimism.io/interop/token-bridging.html
  - https://github.com/ethereum-optimism/actions/pull/287
  - https://github.com/ethereum-optimism/actions/issues/370
---

# BridgeProvider and InteropBridgeProvider

## What We're Building

A new bridge domain in the SDK built around a `BridgeProvider` abstraction and
an initial `InteropBridgeProvider` implementation.

This work starts with solo bridging as a first-class wallet capability and then
expands into cross-chain composition for existing actions. The broad product
goal is that callers can pass `originChainId` and `destinationChainId` into the
same high-level wallet actions they already use, and the SDK will route through
the configured bridge provider when the chains differ.

This brainstorm does not lock implementation details yet. It captures the
agreed product shape, the intended PR breakdown, and the unresolved interface
questions that still need to be answered before planning.

## Why This Approach

Three things shape the direction:

1. The OP interop stack now has a concrete action surface in the viem fork,
   rather than a hypothetical future bridge API.
2. The repo already uses provider abstractions for major domains, so bridge
   support should follow that same pattern instead of becoming ad hoc wallet
   logic.
3. The old bridge spec in PR #287 contains useful architecture notes, but its
   API assumptions are dated. In particular, it predates the wallet naming
   direction in issue #370 and assumes `send()` as the main public entrypoint.

The useful carry-forward from PR #287 is:

- bridge support should sit behind a `BridgeProvider` abstraction
- route support and unsupported-route behavior should be explicit
- quoting should be first-class
- approvals should be handled by the provider layer

The pieces that should not be treated as gospel are:

- `wallet.send(...)` as the public asset-movement method
- native-bridge-specific assumptions as the core abstraction
- automatic origin detection from balances
- third-party-provider-specific framing in the base spec

Issue #370 is the better guide for naming: high-level asset movement should
align around `wallet.transfer(...)`, while raw transaction submission should
stay `wallet.sendTransaction(...)`.

## Agreed Scope

### 1. Core SDK abstraction

The SDK gains:

- an abstract `BridgeProvider` base class
- a concrete `InteropBridgeProvider` implementation as the first provider

The abstraction is intentionally designed to support more providers later, but
the initial docs should not name future providers directly.

### 2. Phase 1 is asset transfer only

Phase 1 bridge support is limited to asset transfer. It is not yet a generic
cross-chain arbitrary-execution engine.

That means phase 1 covers:

- bridge-only asset movement
- quote support for bridge-only asset movement
- backend/frontend/CLI support for the bridge-only action

It does not yet require:

- arbitrary destination calldata execution
- bridge plus swap/lend/borrow composition in the same PR

### 3. `wallet.transfer(...)` is the main public bridge-aware API

The preferred public write surface is `wallet.transfer(...)`, not
`wallet.send(...)`.

Bridge behavior should be implicit from the presence of both
`originChainId` and `destinationChainId`. When those differ, the SDK should
route through the bridge provider.

The same direction likely applies to quoting:

- `wallet.transfer.getQuote(...)`

This keeps bridge-aware asset movement on the same conceptual surface as
same-chain asset movement.

### 4. Existing actions become destination-aware over time

For multi-action work, the intended user experience is that the existing action
methods grow `originChainId` and `destinationChainId`, and the SDK can then
insert the bridge step when necessary.

Examples:

- `wallet.swap.execute(...)`
- `wallet.lend...(...)`
- `wallet.borrow...(...)`

For lend and borrow specifically, the target market already carries chain
identity in its market id or config, so the SDK may be able to infer more about
the intended destination flow there than it can for swap.

### 5. Quote-first composition is part of the long-term interface

For composed cross-chain actions, the quote layer is expected to become the
place where a caller can inspect the planned flow before execution.

The high-level direction is:

- destination-aware wallet methods are the ergonomic execution surface
- quote objects are where bridge plus downstream action planning becomes visible

### 6. Supported assets are defined by `AssetConfig`

Phase 1 public scope should be described in terms of any assets in the
`AssetConfig` allowlist, meaning ETH plus ERC20s.

At the provider level, route support may still be narrower for a given chain
pair or asset. That means the SDK needs both:

- proactive filtering where support can be known in advance
- typed unsupported-route outcomes when a caller requests a route the provider
  cannot actually serve

### 7. Work should be split across multiple PRs

The program should be broken into the following PRs:

1. SDK support for `BridgeProvider` plus `InteropBridgeProvider`
2. Demo backend support for the solo bridge action
3. Demo frontend support for the solo bridge action
4. CLI support for the solo bridge action
5. SDK support for multi-action composition
6. Backend multi-action support
7. Frontend multi-action support
8. CLI multi-action support

## Likely Public Surface

This section is directional, not final.

### Phase 1 likely surface

```ts
await wallet.transfer({
  asset,
  amount,
  recipient,
  originChainId,
  destinationChainId,
})

const quote = await wallet.transfer.getQuote({
  asset,
  amount,
  recipient,
  originChainId,
  destinationChainId,
})
```

With the intended behavior:

- if `originChainId === destinationChainId`, this is same-chain transfer
- if `originChainId !== destinationChainId`, this is a bridge-backed transfer

### Later multi-action direction

```ts
await wallet.swap.execute({
  ...,
  originChainId,
  destinationChainId,
})

await wallet.lend...({
  ...,
  originChainId,
  destinationChainId,
})

await wallet.borrow...({
  ...,
  originChainId,
  destinationChainId,
})
```

The quote path for these composed actions is expected to reveal whether the SDK
will bridge first, act first, or otherwise structure the route.

## Unresolved Questions

These questions remain open and should stay open until a later brainstorm pass
resolves them.

1. Should the bridge-only public surface be only `wallet.transfer(...)` and
   `wallet.transfer.getQuote(...)`, or is there still enough value in a public
   `wallet.bridge` namespace for discovery, advanced controls, status, or route
   inspection?

2. For quote objects, do we need a distinct cross-chain quote type in phase 1,
   or is it sufficient at first to ensure quotes carry `originChainId` and
   `destinationChainId` without introducing a dedicated discriminant yet?

3. For cross-chain transfers, should the bridge abstraction assume same-asset
   intent across chains, or should it already allow asset mapping between
   origin and destination representations in the quote layer?

4. For composed actions where both orderings are plausible, how should the SDK
   decide between `bridge -> swap` and `swap -> bridge`?

5. Should order selection be internal to the quote layer, or should the caller
   eventually be allowed to express a preference such as `auto`,
   `bridge-first`, or `swap-first`?

6. Should we spike returning multiple candidate quotes for different execution
   orders, or is that too complex for the first public interface?
   Note: this is explicitly worth exploring, but may be too complex to expose
   cleanly in the first version of the API.

7. If `wallet.bridge` does exist later, is its value primarily:
   discovery,
   advanced provider selection,
   route comparison,
   message/status tracking,
   or some combination of those?

8. For phase 1 `InteropBridgeProvider`, what exact protocol-level constraints
   should be exposed as user-visible route support versus kept internal to the
   provider implementation?

9. What should the typed unsupported-route outcome look like across wallet
   transfer quoting, bridge discovery, and later multi-action quoting?

10. For multi-action composition, how much can the SDK infer from market chain
    identity versus how much must be passed explicitly by the caller?

11. For cross-chain quote and execution flows, what receipt or status model
    should be exposed to callers once interop is multi-stage and not immediate?

## Out of Scope For This Brainstorm

- locking exact TypeScript interfaces
- locking exact file layout
- locking exact quote/receipt type names
- choosing every future provider shape now
- solving all cross-chain composition ordering questions before phase 1
- implementation details for backend, frontend, or CLI

Those belong in later brainstorm refinement and then `/ce-plan`, not in this
first draft.
