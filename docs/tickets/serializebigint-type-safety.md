# Fix serializeBigInt type-lie and data-loss on the CLI/HTTP boundary

> **AUGMENT existing issue #419** - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | core |
| **Surface** | `packages/sdk/src/utils/serializers.ts` (`serializeBigInt`); `packages/cli/src/output/json.ts` (`writeJson`) + `packages/cli/src/output/errors.ts` (`writeError`); `packages/demo/frontend/src/api/borrowApi.serializers.ts` (`deserializeQuote`) |
| **Resolves findings** | F044, F252, F325 |
| **Candidate existing issue** | #419 |
| **Blocked by** | (none) |

## Problem

`serializeBigInt<T>(obj: T): T` is the single serialization boundary every fund-bearing SDK value crosses on its way to an agent: the CLI routes every success document (`writeJson`) and every error envelope (`writeError`) through it before `JSON.stringify`, and HTTP responses use the same helper. At runtime it does `JSON.parse(JSON.stringify(...))` with a bigint→string replacer, so:

1. **The return type lies.** The signature claims the output is still `T`, but every `bigint` field (`amountInRaw`, `amountOutRaw`, raw balances, `borrowAmountRaw`, `gasEstimate`) is a decimal **string** at runtime. A caller that trusts the type and does bigint arithmetic — `a + b` — string-concatenates instead of adding, producing a wrong fund-moving amount with no compile-time warning. An agent consuming CLI `--json` and assuming JSON numbers silently mis-handles amounts for the same reason.
2. **It silently drops/coerces structured values.** Standard `JSON.stringify` semantics turn `Map`/`Set` into `{}`, `Date` into a string, and drop `undefined` and function values. A balances container expressed as a `Map`, or an optional amount left `undefined`, vanishes at the boundary rather than failing loudly.
3. **The frontend mirror under-hydrates.** `deserializeQuote` re-hydrates only top-level bigints and never touches `q.execution.transactions[].value` (statically `bigint`), so the returned `BorrowQuote` carries string-typed value legs. The SDK doc tells callers to re-dispatch that quote via `wallet.borrow.*`; a future in-browser dispatch would send malformed/zero value legs.

Fund-safety framing: the failure mode is a wrong on-chain amount (string-concat arithmetic, or a zero/malformed `value` leg) that no type check catches. Not exploitable today — the CLI emits the strings for display and the server-wallet path re-executes from raw `Stub*Params` rather than the deserialized quote — but the type contract is a latent footgun directly on the amounts that move funds.

## Findings

- **F044** — `packages/sdk/src/utils/serializers.ts:15-21`: `serializeBigInt<T>(obj: T): T` round-trips through `JSON.parse(JSON.stringify(...))`; the declared return type `T` is false at runtime (every `bigint` becomes a string), and `Map`/`Set`/`Date`/`undefined` are silently coerced or dropped.
- **F252** — `packages/sdk/src/utils/__tests__/serializers.test.ts:1-53`: the test suite covers bigint→string and nested recursion but never pins the data-loss cases (`Map`/`Set`→`{}`, `Date`→string, `undefined` dropped) nor the type-signature lie; it cannot fail when the boundary erases an amount-bearing field. (CLI is the primary production consumer via `json.ts:14-16` / `errors.ts:304`; no separate CLI-side fix — re-verify the envelopes round-trip once the SDK serializer is typed.)
- **F325** — `packages/demo/frontend/src/api/borrowApi.serializers.ts:62-75`: `deserializeQuote` spreads `...q` and re-hydrates only top-level bigints, never `q.execution.transactions[].value` (bigint per `packages/sdk/src/types/transaction.ts:13`), so the returned `BorrowQuote` is a type-lie carrying string-typed value legs on the quote the SDK doc (`packages/sdk/src/types/borrow/quote.ts:48-49`) says to re-dispatch.

## Root cause

One bug in two places, plus a missing test:

- The SDK serializer encodes a value-level transform (drop bigints to strings) but advertises an **identity** type (`T → T`). The type should reflect what the function actually returns. The frontend already has the correct shape of this type — `Serialized<T>` at `packages/demo/frontend/src/util/serialize.ts:10-14`, a distributive conditional that maps `bigint → string` recursively. The SDK never adopted an equivalent, so every SDK caller sees the identity lie.
- `deserializeQuote` is hand-written field-by-field and was never updated when `BorrowQuote.execution.transactions` was added, so nested bigint legs are left as wire strings.
- The test suite only exercises the happy bigint cases, so neither the type-lie nor the structured-value data-loss has a regression guard (F252).

## Recommended approach

**SDK serializer (F044) — refactor allowed.**
- Change the signature so it stops lying. Either return a `Serialized<T>` mapped type that turns `bigint → string` recursively (callers opt into the string view, mirroring the frontend `Serialized<T>` at `packages/demo/frontend/src/util/serialize.ts:10-14` — promote/share one definition rather than maintaining two), or return `unknown` / a `JsonValue` type and force callers to narrow. Prefer the `Serialized<T>` mapped type: it preserves ergonomics while making the string-view explicit at every call site.
- For the structured-value data-loss: at minimum document that `Map`/`Set`/`Date`/`undefined` follow `JSON.stringify` semantics (the JSDoc already does). Where the SDK can know better, guard/reject `Map`/`Set` inputs (these indicate a caller passing a non-JSON shape into a JSON boundary) rather than silently emitting `{}`. Keep this surgical — do not expand into a general structured-clone library.

**Frontend `deserializeQuote` (F325) — review-only, low-risk fix, no architectural refactor.**
- Re-hydrate the nested `execution.transactions[].value` (and any other bigint leg fields) inside `deserializeQuote`, so the returned `BorrowQuote` matches its static type, OR narrow the return type to an explicit gate-only shape that does not claim a dispatchable `BorrowQuote`. The re-hydrate is the smaller change and keeps the SDK's advertised re-dispatch pattern honest.

**CLI `writeJson` / `writeError` (F252 refinement) — review-only, no refactor.**
- No CLI-side code change beyond consuming the newly-typed SDK serializer. Once the SDK signature is honest, re-verify the CLI envelopes (`amountInRaw`, `amountOutRaw`, balances) still round-trip and that no call site newly type-errors. Optionally document in CLI output help that raw bigint fields are emitted as decimal strings so agents parse them as such.

## Affected files

- `packages/sdk/src/utils/serializers.ts:15-21` — `serializeBigInt` signature + optional Map/Set guard.
- `packages/sdk/src/utils/__tests__/serializers.test.ts:1-53` — add the missing regression cases (F252).
- `packages/cli/src/output/json.ts:14-16` — `writeJson` consumer; re-verify round-trip, no logic change.
- `packages/cli/src/output/errors.ts:293-304` — `writeError` consumer; re-verify round-trip, no logic change.
- `packages/demo/frontend/src/api/borrowApi.serializers.ts:62-75` — `deserializeQuote` re-hydrate nested value legs.
- `packages/sdk/src/types/transaction.ts:13` — `TransactionData.value: bigint` (reference; the type the leg must round-trip to).
- `packages/sdk/src/types/borrow/quote.ts:48-49` — re-dispatch doc that motivates the frontend fix (reference).
- `packages/demo/frontend/src/util/serialize.ts:10-14` — existing `Serialized<T>` mapped type to mirror/share (reference).

## Acceptance criteria / tests

- `serializeBigInt`'s return type no longer claims `T` for bigint-bearing inputs; a call site doing bigint arithmetic on a serialized field is a compile error (or requires an explicit narrow).
- New unit tests in `serializers.test.ts` assert: (a) the result type is the string-view, (b) a `Map`/`Set` input is rejected or explicitly documented-and-asserted to flatten, (c) a `Date` field's coercion is pinned, (d) an object with an `undefined` optional amount field has documented behavior pinned. Each test fails if the boundary silently erases an amount-bearing field.
- A regression test asserts `typeof quote.execution.transactions[0].value === 'bigint'` after `deserializeQuote`.
- CLI `writeJson`/`writeError` compile against the new signature with no behavior change; `--json` output for a fund-moving command still round-trips `amountInRaw`/`amountOutRaw`/balances as decimal strings.
- `pnpm typecheck`, `pnpm lint`, and the affected unit tests pass across `sdk`, `cli`, and `demo/frontend`.

## Notes

- This is an **augment of #419**, not a new issue. Land the SDK signature change first, then the frontend re-hydrate and the new tests; the CLI side is verification-only and should produce no diff beyond what the new SDK type forces.
- RPC trust is out of scope (integrators bring their own RPC); this ticket is purely about an SDK-internal type contract and a boundary data-loss the SDK already knows about.
- The demo/frontend change is the low-risk fund-safety fix only (re-hydrate the value legs); no architectural refactor of the serializer layer.
- Not exploitable today, but the type-lie sits directly on the bigint amounts that move funds, so it is worth closing alongside the rest of #419's signing/output-boundary hardening.
