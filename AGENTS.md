# AGENTS.md

Instructions for AI coding agents working on the **Actions SDK monorepo itself**. If you are an agent helping a developer *integrate* the published SDK into their app, see [`llms-full.txt`](./llms-full.txt) instead.

This file is the actionable rules. The full prose, rationale, and examples live in [CONTRIBUTING.md](./CONTRIBUTING.md). When in doubt, read CONTRIBUTING.md; it is canonical.

## Repo at a glance

- **Monorepo**: pnpm workspaces. Packages in `packages/`.
  - `packages/sdk/`: the published TypeScript SDK (`@eth-optimism/actions-sdk`)
  - `packages/demo/backend/`: Hono-based Node.js demo
  - `packages/demo/frontend/`: React + Vite demo
- **Node**: >= 18.
- **SDK shape**: provider pattern. Domains live under `packages/sdk/src/actions/<domain>/` with a `core/` base class, `providers/<protocol>/` concrete implementations, `namespaces/`, `__mocks__/`. Cross-environment factories in `nodeActionsFactory.ts` / `reactActionsFactory.ts`. Built on viem.
- **Today's domains**: `lend/`, `swap/`. `borrow/` is anticipated; new domains follow the same shape.

## Verify before commit

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Zero new lint warnings, zero new TypeScript errors. The baseline only goes down.

## Hard rules

The bullets below are the rules. Each links to the section in CONTRIBUTING.md with the *why*.

### [Testing](./CONTRIBUTING.md#testing)

- Every new feature ships with tests. PR doesn't merge until CI is green.
- Unit tests for logic; integration tests for cross-layer behavior. Most non-trivial changes need both.
- Mock at boundaries (RPC, wallet provider, bundler, third-party SDKs). **Never mock `encodeFunctionData`, `decodeFunctionData`, `keccak256`, `encodeAbiParameters`.**
- Bug fixes require a regression test that fails without the fix.

### [Reuse before invention](./CONTRIBUTING.md#reuse-before-invention)

- Grep before writing any new utility, mock, fixture, or helper.
- First places to check: `packages/sdk/src/__mocks__/`, per-domain `__mocks__/`, `packages/sdk/src/utils/{validation,approve,assets}.ts`, `packages/demo/backend/src/utils/serializers.ts`, `packages/demo/frontend/src/utils/formatters.ts`.
- Naming: `*Raw` suffix is reserved for `bigint`; verbs are `getX` / `buildX` / `resolveX` / `validateX`.

### [Prefer viem patterns](./CONTRIBUTING.md#prefer-patterns-set-by-direct-dependencies-especially-viem)

- Errors: named concrete classes extending `BaseError`. Discriminate via `instanceof`, not `error.code`.
- ABIs: `as const`. Don't widen to `Abi`.
- Encoding: `encodeFunctionData` / `decodeFunctionData` with the ABI inline.
- Clients: multicall and transport composition over hand-rolled batchers.
- **Extraction trigger: the second concrete usage, not a speculative first.**

### [Type safety](./CONTRIBUTING.md#type-safety-and-precision)

- No `any`. Use `unknown` and narrow.
- No unsafe casts (`as Foo`); tighten the upstream type instead.
- Prefer the narrowest accurate type: `SupportedChainId` over `number`, `Hex`/`Address` over `string`.
- Tighten loose types in the same PR you touch them. The baseline ratchets down.
- `readonly T[]` for non-mutated collection params. Discriminated unions over both-optional-one-required. `import type` for type-only imports.

### [Abstraction hierarchy](./CONTRIBUTING.md#abstraction-hierarchy)

- Concrete providers stay thin. Validation, amount conversion, approval building, calldata verification, error wrapping, and chain intersection all belong on the base.
- If a second provider in the same domain would want code you're writing inside a concrete provider, **hoist before landing**.

### [Adding a new provider](./CONTRIBUTING.md#introducing-a-new-provider)

- Extend the domain's existing base class (`LendProvider`, `SwapProvider`). Never roll a parallel abstraction.
- **One protocol version per provider, one domain per PR.** No bundled V2 + V3, no bundled Lend + Borrow.
- For forks of supported protocols (Spark of Aave, Uniswap V3 forks, Compound forks), introduce a shared intermediate base class. Don't copy-paste a full provider.
- Implement protected `_methods` (`_openPosition`, `_getQuote`, …); public methods stay on the base.
- Declare chain support via `protocolSupportedChainIds()`.
- Avoid pulling in the protocol's full SDK unless it provides material correctness or ergonomics value. Prefer viem + ABI snippets.
- Today: protocol code lives under `packages/sdk/src/actions/<domain>/providers/<protocol>/`. When a protocol first spans multiple domains, promote its shared constants/ABIs/registries to `packages/sdk/src/providers/<protocol>/` (introduce that home in its own small PR ahead of the second domain).
- Config shape (`<Protocol><Domain>ProviderConfig`) parallels sibling providers.
- Register in `packages/sdk/src/types/providers.ts` under the right domain record. Wire into `Actions` (`packages/sdk/src/actions.ts`) and the `Wallet` / `SmartWallet` classes (`packages/sdk/src/wallet/core/wallets/`) following the existing construction pattern.
- Ship a `Mock<Protocol><Domain>Provider` in `__mocks__/` matching the existing mock shape.
- Tests use the subclass-to-expose-protected pattern.
- Errors are named concrete classes at throw site (viem pattern).
- JSDoc every public method (`@description` / `@param` / `@returns` / `@throws`). Update the SDK README's provider list.

### [Structure](./CONTRIBUTING.md#structure)

- Functions ≤ 20 lines of logic; files ≤ 200 lines; nesting ≤ 2 levels. Early returns; guard clauses.
- A domain doesn't reach into another domain's internals. Cross-domain helpers go in `utils/` or `actions/shared/`.
- Keep the public API surface (`index.ts` exports) small.

### [Readability](./CONTRIBUTING.md#readability)

- Clear names beat clever tricks. Comments explain **why**, not **what**.
- Delete dead code, unused imports, and commented-out blocks as you encounter them.
- `const` over `let`; never `var`. Async/await over promise chains.
- **No em-dashes (`—`) in code comments, JSDoc, or repo docs.** Use commas, colons, semicolons, periods, or parentheses instead.

### [Documentation](./CONTRIBUTING.md#documentation)

- JSDoc every public function/method/class with `@description` / `@param` / `@returns` / `@throws`.
- Don't restate types in prose. Add semantics, units, preconditions.
- Update JSDoc in the same commit as behavior changes. Stale docs are worse than missing ones.

### [Error handling](./CONTRIBUTING.md#error-handling)

- Throw named concrete error classes; callers discriminate via `instanceof`.
- Wrap protocol/SDK errors at the concrete-provider/base seam.
- Validate at boundaries, not at every internal hop.
- Never `try { } catch {}` without rethrow, log, or recovery. Never `throw new Error(err.message)`; preserve `cause`.

### [Performance and async](./CONTRIBUTING.md#performance-and-async)

- Batch reads with viem multicall or `Promise.all`. Never sequential awaits in a loop.
- No hidden caching inside provider methods. Caller decides.
- Clean up listeners, subscriptions, `AbortController`s.

### [Security](./CONTRIBUTING.md#security)

- Never log or persist secrets (private keys, tokens, signed messages).
- Validate addresses and amounts at boundaries; coerce `string` → `Address` and `number` → `bigint` explicitly.
- Verify calldata integrity before signing. The base layer does this; don't skip it.
- No `eval`, no `new Function`, no dynamic code generation in production paths.

### [Dependencies](./CONTRIBUTING.md#dependency-hygiene)

- Don't add a dep for what viem already does.
- Prefer peer dependencies for wallet providers and host-supplied SDKs.
- `^x.y.z` ranges by default; full pins only with a justifying comment.

### [Public API stability](./CONTRIBUTING.md#public-api-stability)

- `packages/sdk/src/index.ts` is a contract. Renames, removals, and signature changes are breaking.
- **Run `pnpm changeset` for every change in `packages/sdk/`**, even if it looks internal.
- Deprecate via `@deprecated` JSDoc; remove only on majors.

### [Enforcement](./CONTRIBUTING.md#enforcement)

- `// eslint-disable` requires a reviewer-approved justification.
- Intentional shortcuts under deadline pressure leave `// TODO(@handle):` with a linked issue.

## Workflow

1. Open or read an issue first for non-trivial changes.
2. Branch off `main` with a descriptive name (`feat/`, `fix/`, `docs/`).
3. Small commits, conventional messages.
4. Run `pnpm typecheck && pnpm lint && pnpm test` before pushing.
5. Add a changeset (`pnpm changeset`) if you touched `packages/sdk/`.
6. Open the PR with a thorough description.

See [CONTRIBUTING.md § Workflow for Pull Requests](./CONTRIBUTING.md#workflow-for-pull-requests) for the full workflow, rebasing guidance, and changeset/release flow.

## When you don't know

- Read neighbor files before writing a new one.
- Use viem's idiom before inventing a new one.
- Duplicate once before you abstract. The second usage triggers extraction.
- Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the rationale, then choose the option that keeps the SDK small, idiomatic, and easy to extend.
