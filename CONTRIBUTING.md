# Actions SDK Contributing Guide

## Workflow for Pull Requests

🚨 Before making any non-trivial change, please first open an issue describing the change to solicit feedback and guidance. This will increase the likelihood of the PR getting merged.

In general, the smaller the diff the easier it will be for us to review quickly.

In order to contribute, fork the repository and make pull requests against the `main` branch

Additionally, if you are writing a new feature, please ensure you add appropriate test cases.

Follow the [Setup](https://github.com/ethereum-optimism/actions?tab=readme-ov-file#setup) section in the README to set up your local development environment.

We recommend using the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) format on commit messages.

Unless your PR is ready for immediate review and merging, please mark it as 'draft' (or simply do not open a PR yet).

Once ready for review, make sure to include a thorough PR description to help reviewers.

**Bonus:** Add comments to the diff under the "Files Changed" tab on the PR page to clarify any sections where you think we might have questions about the approach taken.

## Engineering Principles

These principles apply to every PR in this repository. They exist to keep the SDK small, idiomatic, easy to extend, and safe to depend on. New contributors (human and agent) should read this section before their first PR; reviewers should treat it as a checklist.

The compact agent-actionable mirror of this section lives in [AGENTS.md](./AGENTS.md). When the two diverge, this document wins; `AGENTS.md` should be brought back into sync.

### Testing

- Every new feature ships with tests. A feature is "done" only when tests are green locally and in CI.
- **Unit tests** prove logic in isolation. **Integration tests** prove the layers work together (callbacks, userOp batching, error propagation, cross-provider behavior). Most non-trivial changes need both.
- **Mock at boundaries**: RPC, wallet providers, bundlers, third-party SDKs. **Never mock pure utilities** (`encodeFunctionData`, `decodeFunctionData`, `keccak256`, `encodeAbiParameters`). Those functions are load-bearing for correctness; a mocked encoder can let a broken caller pass tests.
- **Subclass-to-expose-protected** is the canonical pattern for testing base-class behavior from within a concrete provider's tests. Don't reach for runtime hacks (`(obj as any)._method`) when the type system can express the test intent.
- Tests should be fast and reliable. Flaky tests get fixed or deleted, not retried.
- When you fix a bug, add a regression test that fails without the fix and passes with it. The test is what prevents the next contributor from re-introducing the bug.

### Reuse before invention

- **Grep before writing** new utilities, mocks, fixtures, or helpers. Most domains in this repo already have one.
- Canonical locations to check first:
  - Mocks: `packages/sdk/src/__mocks__/` and per-domain `__mocks__/` directories
  - Validation: `packages/sdk/src/utils/validation.ts`
  - Approvals: `packages/sdk/src/utils/approve.ts`
  - Asset math: `packages/sdk/src/utils/assets.ts`
  - BigInt serialization: `packages/demo/backend/src/utils/serializers.ts`
  - Display formatters: `packages/demo/frontend/src/utils/formatters.ts`
- Extend existing helpers rather than writing a second one with a slightly different name.
- Follow neighbor-file naming. The `*Raw` suffix is reserved for `bigint` units; verbs are `getX` / `buildX` / `resolveX` / `validateX`. Don't introduce new verb prefixes without a reason that survives review.
- The same principle applies to types: before adding a new type, check whether a sibling already exists or whether tightening an existing one is the right move.

### Prefer patterns set by direct dependencies (especially viem)

The SDK is a thin layer over viem. Where viem has an idiom, use it.

- **Errors**: named concrete classes extending `BaseError`. No abstract repo-wide supertype. Callers discriminate via `instanceof`, not via `error.code` strings.
- **Type safety**: `as const` ABIs, discriminated unions, narrowed `args` on `encodeFunctionData` / `decodeFunctionData`. Let viem's inference do the work.
- **Encoding/decoding**: `encodeFunctionData` / `decodeFunctionData` with the ABI inline; do not hand-roll calldata.
- **Client configuration**: multicall batching, transport composition (`fallback`, `http` with retry options) over reinventing batched RPC clients.
- When a problem has a viem-native pattern, **use it**. Don't introduce a parallel "SDK-wide base" (errors, result types, option objects) without evidence of a concrete repeated need.
- **Extraction trigger: the second concrete usage, not a speculative first.** Prefer the cost of one duplication over the cost of a premature abstraction nobody else follows.

### Type safety and precision

- **Prefer the narrowest accurate type.** If a value is actually a `SupportedChainId`, don't type it as `number`. If a value is actually a `Hex`, don't type it as `string`. The compiler can only help to the extent we let it.
- **No unsafe casts.** `as SomeType` hides a runtime contract the compiler can't verify. If you find yourself writing `as Foo`, ask whether the upstream return type should be tightened instead. Usually it should. Narrow at the source, not the sink.
- **Tighten existing types as you touch them.** When editing a file whose types are loose (e.g. `number[]` where `SupportedChainId[]` would be accurate), fix it in the same PR. The lint baseline ratchets down; so should the type-laxity baseline.
- **`readonly` on collection parameters** that aren't mutated. Public APIs that accept arrays should declare `readonly T[]` unless they genuinely need to mutate. Saves callers from defensive copies.
- **Discriminated unions beat optional-field combos.** When two sets of fields are mutually exclusive, encode that with a `kind` discriminator rather than both-optional-one-required patterns. Compiler narrowing + exhaustive `switch` comes for free.
- **`const` assertions for fixture ABIs and enum-like constants.** Let viem infer the narrowest types from `as const` ABIs; don't widen them to loose `Abi` when re-exporting.
- **No `any`.** Forbidden by repo convention. If you need an escape hatch, use `unknown` and narrow explicitly. Escape hatches cluster and rot.
- **Type-only imports.** Use `import type` for type-only symbols so the bundler can tree-shake them cleanly.
- **Prefer `interface` over `type` for object shapes** for declaration merging and clearer error messages. Use `type` for unions, intersections, and mapped types.
- **Strict null checks.** Prefer `T | undefined` over `T | null`; the SDK doesn't model database nullability and shouldn't pretend to.

### Abstraction hierarchy

- **Shareable code does not live inside a specific provider.** If logic is general enough to be used by more than one provider in the same domain (or across domains of the same protocol), it belongs in a base class, a shared utility, or the cross-domain `packages/sdk/src/actions/shared/` directory, not in a concrete provider file.
- **Provider implementations stay thin.** Concrete providers hold only code specific to that exact protocol integration: contract calls, protocol-specific encoding, protocol-specific quirks. Validation, amount conversion, approval building, chain intersection, error wrapping, and calldata verification all belong higher up the hierarchy.
- When adding code to a concrete provider, ask: "Would a second concrete provider want this same code?" If yes, hoist before landing.
- **Extraction trigger: the second usage, not the third.** The moment you would copy-paste from one provider to another, that's the signal to extract. Don't wait for a third instance to "prove" the abstraction.
- **One direction of dependency.** Concrete providers depend on their base; bases never reach down into concrete providers. If a base needs to know which subclass it has, the design is wrong; split the behavior or invert the relationship.

### Introducing a new Provider

When adding a new concrete provider to any SDK domain (Lend, Swap, Borrow, or a future domain):

- **Extend the domain's existing base class** (`LendProvider`, `SwapProvider`, `BorrowProvider`). Do not roll your own abstraction parallel to these or skip the base.
- **If the protocol is a fork of one we already support, share the implementation.** Spark is an Aave fork; many AMMs are Uniswap V3 forks; many lending markets are Compound forks. The right move is usually an intermediate base class (e.g. a shared `AaveV3CompatibleLendProvider` that both Aave and Spark extend) that encodes only the delta between the forks. Copy-pasting a full provider for a fork is the wrong shape; extract before the second concrete class lands.
- **One protocol version per provider.** When a protocol has multiple major versions (Uniswap V2 / V3 / V4, Aave V2 / V3, Compound V2 / V3, Morpho Legacy / Blue, etc.), pick one version per provider and per PR. A single provider supporting two versions via branching logic taxes every future change. If you later need the other version, ship it as a sibling provider with its own name.
- **One domain per PR, even for multi-action protocols.** When a protocol supports more than one SDK domain (Aave supports both Lend and Borrow; Morpho supports both; future protocols may add Swap + Lend, etc.), introduce each domain's provider in its **own** PR. Do not bundle `AaveLendProvider` and `AaveBorrowProvider` into a single PR. They each have their own tests, config shape, namespace wiring, and integration tests; bundling inflates review cost and couples unrelated risk. Today, protocol implementations live in their domain directory (e.g., `packages/sdk/src/actions/lend/providers/aave/`). When a protocol first spans multiple domains, extract its shared constants, ABIs, and registries into a cross-domain home in its own small PR ahead of the second domain-provider PR, so both domain-provider PRs start from a stable shared base. Pick the location when the need arises; no such cross-domain home exists in the repo yet.
- **Implement the protected `_methods`, not the public ones.** Public methods (`openPosition`, `closePosition`, `getQuote`, etc.) live on the base and do the cross-provider work: validation, amount conversion, approval building, and calldata integrity verification. Your concrete class implements `_openPosition`, `_getQuote`, etc. If you find yourself overriding a public method, something is wrong with the base; hoist there, don't override here.
- **Declare chain support via `protocolSupportedChainIds()`.** Return only chains where the protocol is actually deployed. The base intersects this with repo-wide and user-configured chains.
- **Keep providers thin.** Only protocol-specific logic belongs inside the concrete class: contract calls, protocol-specific encoding, protocol quirks. No validation, no amount conversion, no allowlist checks, no error wrapping. Those live on the base. Litmus test: if a second provider in the same domain would want this code, it belongs on the base or a shared utility.
- **Avoid pulling in the protocol's full SDK unless you truly need it.** Actions targets a narrow slice of each protocol: typically a handful of contract functions and a couple of read paths. If you can do the integration with viem plus ABI snippets, prefer that over importing the protocol's entire SDK (which drags in their own types, opinionated helpers, and dependency tree). Only bring in the upstream SDK when it provides material correctness or ergonomics value you'd otherwise have to reimplement (complex position math, event decoding, multi-chain registry lookups). Evaluate per protocol; don't import by reflex.
- **Protocol-shared constants, ABIs, and registries** that span multiple domains go in a cross-domain per-protocol home, extracted when the second domain for that protocol lands. Single-domain protocol code stays under that domain (e.g., `packages/sdk/src/actions/lend/providers/<protocol>/`). Anything that Lend + Borrow providers of the same protocol could both use (contract addresses, interest-rate models, ABI re-exports, market-id derivation) is the trigger for the extraction.
- **Config shape parallels sibling providers.** `<Protocol><Domain>ProviderConfig` mirrors whatever the domain's other providers use (allowlist/blocklist, settings nesting, etc.). Don't invent a new config shape for one provider.
- **Register in `packages/sdk/src/types/providers.ts`** under the domain-specific provider record (`LendProviders`, `SwapProviders`, etc.). Wire into the `Actions` class (`packages/sdk/src/actions.ts`) and the `Wallet` / `SmartWallet` classes (`packages/sdk/src/wallet/core/wallets/`) following the existing construction pattern. Users opt-in via `config.<domain>.<provider>`. Use the existing null-namespace proxy (when the domain has one) so `wallet.<domain>.<method>()` surfaces a typed error rather than silently no-oping.
- **Ship a `Mock<Protocol><Domain>Provider`** in `__mocks__/` matching the existing mock shape (`MockedFunction` field reassignments in the constructor; see the domain's sibling mocks).
- **Test with the subclass-to-expose-protected pattern** for any base-class behavior your provider exercises. Mock upstream SDKs and viem clients at their boundary; never mock pure utilities (`encodeFunctionData`, `decodeFunctionData`, `keccak256`, `encodeAbiParameters`).
- **Errors are named concrete classes** (viem pattern) at the point they're thrown, not `throw new Error(string)`, when they expose something the caller needs to discriminate via `instanceof`.
- **Document publicly**: JSDoc every public method with `@description` / `@param` / `@returns` / `@throws`. Update the SDK README's provider list.

### Structure

- **Single responsibility**: one concern per function, one domain per module. If a function needs the word "and" to describe it, split it.
- **Function length**: target ≤ 20 lines of logic. Above that, the function is usually doing two things.
- **File length**: target ≤ 200 lines. Above that, look for a natural split (often a base class or a utility module).
- **Nesting**: max 2 levels of control flow inside a function. Prefer early returns and guard clauses.
- **Module boundaries**: a domain (`lend`, `swap`, `borrow`) doesn't reach into another domain's internals. Cross-domain helpers belong in `utils/` or `actions/shared/`.
- **Public API surface stays small.** Only re-export from `index.ts` what consumers actually need. Internal helpers stay internal; once exported, they become a maintenance liability.

### Readability

- Clear names beat clever tricks. No one-letter locals outside loop indices.
- Comments explain **why**, not **what**. The code already says what it does.
- Do not rewrite existing comments just to shorten them unless explicitly asked. Leave unrelated docs and comments alone.
- New or changed inline `//` comments should be concise and usually one line. If the explanation needs structure, tags, or API contract details, use JSDoc instead of a stack of inline comments.
- Do not include internal sub-issue IDs (for example `F123`) in comments, test names, or docs. Link the real GitHub issue only when the context is useful.
- Delete dead code, unused imports, and commented-out blocks as you encounter them. Git history is the archive.
- Prefer `const` over `let`; never `var`.
- Use destructuring, optional chaining (`?.`), nullish coalescing (`??`), and template literals where they make the code clearer, not to score points.
- Async/await over promise chains. Mixing the two in the same function is a code smell.
- Prefer array methods (`map`, `filter`, `flatMap`, `reduce`) over manual loops when the result is clearer.
- **No em-dashes (`—`) in code comments, JSDoc, or repo documentation.** Rephrase or use commas, colons, semicolons, periods, or parentheses. Em-dashes are a tell of LLM-generated prose and clutter diffs with non-ASCII punctuation.

### Documentation

- **JSDoc every public function, method, and class.** Use the repo's existing style (see `LendProvider.openPosition`, `SwapProvider.getQuote` for canonical examples). Required tags:
  - `@description`: one-to-two-line summary that explains *what* and *why*, not *how*.
  - `@param <name>`: per parameter, describing semantics (units, invariants, preconditions).
  - `@returns`: what the caller gets back, including edge cases like `undefined` / `null` / empty arrays.
  - `@throws`: enumerate every error class or condition the caller might need to handle.
- **Do not flatten function or class JSDoc into single-line comments** just to satisfy inline-comment concision. Keep useful `@description`, `@param`, `@returns`, `@throws`, and semantic notes.
- **Protected/private helpers worth documenting**: if the helper's contract is non-obvious (async side effects, specific error behavior, numeric-precision assumptions), add a brief JSDoc. A one-line block is fine.
- **Don't duplicate the code in prose.** `@description` should add information the signature doesn't already carry (units, assumptions, call-site expectations), not restate what types already say.
- **Cross-reference siblings** with `{@link}` when a method has a related peer (e.g., `openPosition` links to `closePosition`).
- **Keep docs current when you edit.** Stale docs are worse than missing ones. When you change behavior, update the JSDoc in the same commit.

### Error handling

- **Throw named concrete error classes** for any failure a caller might need to discriminate. Discrimination via `instanceof` is part of the public contract; discrimination via string matching on `.message` is not.
- **Wrap protocol errors at the boundary** between the concrete provider and the base. The base's job is to translate raw RPC / SDK errors into the SDK's own error vocabulary. Callers should never need to know whether an error came from viem, the bundler, or the protocol SDK.
- **Validate inputs at boundaries** (public methods, exported helpers), not at every internal hop. Internal code trusts internal code.
- **Don't swallow errors.** A `try { ... } catch {}` with no rethrow, log, or recovery is a bug. If the error is genuinely recoverable, document why in a comment.
- **Don't catch and re-`throw new Error(err.message)`**: it discards the original stack and any structured fields. Re-throw the original or wrap it in a class that retains `cause`.

### Performance and async

- **Batch reads.** When reading multiple values from the same chain, use viem's multicall (`client.multicall`) or `Promise.all`; never sequential awaits in a loop.
- **Don't fetch what you don't need.** Pull only the fields the caller asked for. Computing a full position when the caller only wants APY is wasteful.
- **Cache at the right layer.** Don't add ad-hoc caching inside provider methods; if a value is genuinely cacheable, the caller can cache it. The SDK avoids hidden state.
- **Cleanup async resources.** Listeners, subscriptions, and `AbortController`s need explicit teardown paths. The frontend in particular leaks fast without this.
- **Magic numbers and strings** become constants. Magic addresses become typed `Address` constants in a `constants/` file.

### Security

- **Never log or persist secrets.** Private keys, signing seeds, API tokens, and signed messages do not belong in logs, error messages, or telemetry.
- **Validate addresses and amounts at boundaries.** A `string` from a user is not an `Address`; a `number` from a UI is not a `bigint`. Coerce explicitly.
- **Verify calldata integrity before signing.** When the SDK constructs a tx that the user will sign, the base layer verifies the encoded calldata matches the function and arguments the user intended. Don't skip this; the whole point of the SDK is that consumers can trust it.
- **No `eval`, no `new Function`, no dynamic code generation** anywhere in production paths.

### Dependency hygiene

- **Don't add a dependency for what viem already does.** Most ABI/encoding/decoding/client problems have a viem answer.
- **Prefer peer dependencies** for wallet providers and other host-supplied SDKs. Bundling them inflates install size and creates version conflicts.
- **Pin minor versions, not patch.** `^x.y.z` is the default; full pins (`x.y.z`) only when you're working around a known regression and have a comment explaining it.
- **Run a bundle-size check** in your head when adding a new SDK dep: what does it pull in transitively? If you don't know, find out before opening the PR.

### Public API stability

- **Treat `index.ts` as a contract.** Removing or renaming an export is a breaking change. So is changing a parameter shape, a return type, or an error class.
- **Use changesets** for every change that touches `packages/sdk/`, even if you think it's internal. The SDK team decides what counts as breaking, not the diff size.
- **Deprecate, don't delete.** Mark the old API with `@deprecated`, point to the replacement, and remove it in the next major. Surprise removals are how downstream consumers learn to pin old versions and stop upgrading.
- **No experimental APIs without a flag.** If something isn't ready for public consumption, keep it internal or namespace it (e.g., `experimental_` prefix) so consumers know.

### Enforcement

- Run `pnpm typecheck && pnpm lint && pnpm test` before every commit.
- **Zero new lint warnings.** Not just zero errors. Silencing via `// eslint-disable` requires reviewer-approved justification. Treat the lint baseline as a ratchet: warnings only go down.
- **Zero new TypeScript errors.** Same ratchet logic; if you find existing errors in code you touch, fix them in the same PR.
- Intentional violations under time pressure leave a `// TODO(@handle):` comment with a linked follow-up issue in the same PR.
- CI runs the same commands. A passing local run that fails CI usually means a missing commit (a `.changeset` file, a generated artifact); check the diff against your branch.

### Rebasing

We use the `git rebase` command to keep our commit history tidy.
Rebasing is an easy way to make sure that each PR includes a series of clean commits with descriptive commit messages
See [this tutorial](https://docs.gitlab.com/ee/topics/git/git_rebase.html) for a detailed explanation of `git rebase` and how you should use it to maintain a clean commit history.

### Versioning

When we need to fix bugs or introduce new features in our npm packages, we update the package version. To ensure consistency and simplicity in this process, we use a tool called [changesets](https://github.com/changesets/changesets).

Each changeset contains three key pieces of information:

- The package(s) to be published
- Whether the release is [major, minor, or a patch](https://semver.org/)
- A description of the change, which will be added to the autogenerated CHANGELOG.md file for the package.

Once you are ready to start the process of publishing your changes to npm, run:

```bash
pnpm changeset
```

This command will guide you through the process of selecting packages and defining the changes. Once complete, a new file will be generated, which you need to commit to the repository. Here's an [example changeset](https://github.com/ethereum-optimism/actions/blob/7464702ff85718f3a1a6825b19164ff8de20e243/.changeset/thin-donuts-leave.md)

#### Publishing Flow

When the changeset is merged into the main branch, the `release` CircleCI workflow is started. This will kick off two jobs:

**Publish snapshot versions**

This action publishes a snapshot of the package(s) to npm. The version number will follow a pattern like `0.0.0-main-20240906142838` instead of a standard [semver version](https://semver.org/).

**Publish new versions**

This action looks for changesets on the main branch and automatically [opens a new pull request](https://github.com/ethereum-optimism/actions/pull/189). This PR will:

- Delete changeset files related to the current release
- Bump the package version following [semver](https://semver.org/)
- Update the autogenerated CHANGELOG.md for the package(s)

**Once this version PR is merged, the release will be published to npm.**

### Contributions Related to Spelling and Grammar

At this time, we will not be accepting contributions that primarily fix
spelling, stylistic or grammatical errors in documentation, code or elsewhere.

Pull Requests that ignore this guideline will be closed,
and may be aggregated into new Pull Requests without attribution.
