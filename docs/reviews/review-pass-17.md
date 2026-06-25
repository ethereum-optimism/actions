# Review Pass 17 — cli ce-code-review (review-only)

**Pass:** 17
**Skill:** cli ce-code-review (review-only)
**Surfaces:** cli (fund-moving verbs, parse/resolver layer, key/secret surface, output/redaction/serialization)

## Summary

This pass reviewed the CLI fund-safety boundary in four overlapping sweeps: (1) the fund-moving write verbs (lend/borrow/swap) plus the shared `parseAmount`/`parseDecimal`/`parseSlippage`/`parseDeadline`/`parseApprovalMode` parsers; (2) the key/secret surface (`PRIVATE_KEY` → `parseSigner` → viem LocalAccount, `config/env.ts`, and the `output/errors.ts` redaction pipeline); (3) the resolvers + output + serialization layer; and (4) the wallet send/transfer-equivalent verbs end-to-end (arg → resolver → SDK call → output envelope).

The prior pass's recipient-passthrough / PRIVATE_KEY-error-leak / no-pre-send-confirmation / deadline-bounds / RPC-URL-echo / redaction-conservatism / serializer families (F327–F333 + `refines:F252`) were **not re-filed**; this pass surfaces the residual NEW gaps beyond them.

**Counts (incoming, after merge):**
- NEW findings: 10 (1 medium-correctness, 1 medium-info, 8 low/info)
- REFINES: 4 (`refines:F327`, `refines:F332`, `refines:F333` ×2)
- DUP: 1 (`dup:F252`)
- By severity (new): medium 2, low 8

**Notable highlights:**
- The CLI amount-parse layer is **asset-agnostic**: amounts are never validated against the resolved asset's `decimals`, and every amount round-trips through `Number(raw)` before the SDK re-parses with `parseUnits`. viem silently rounds excess precision, and lend/borrow envelopes echo the *typed* value rather than the on-chain value (F334, medium).
- The error **redactor is name-keyed only** and its string-value branch runs *before* the SCALAR_ALLOWLIST gate, so any string property of a wrapped `cause` survives verbatim (URL-strip only). SENSITIVE_KEYS omits `transaction`/`data`/`value`/`to`/`mnemonic`/`seed` (F338, F341). It also has no depth/cycle guard, so a circular thrown value crashes the last-resort reporter (F339).
- `resolveAsset` silently first-matches by symbol on the fund-moving swap `--in`/`--out` path while sibling market resolvers throw on ambiguity (F342).

---

## Findings by surface

### Surface: cli — fund-moving verbs & parse layer

#### F334 — Amount flags are not validated against the resolved asset's decimals (excess precision silently rounded; envelopes echo the typed amount) — `medium` / `correctness` — NEW

- **File:** `packages/cli/src/utils/parseAmount.ts:20-28` (and the float round-trip at `packages/cli/src/utils/parseDecimal.ts:23`)
- **Detail:** `parseAmount` (and the whole CLI parse layer) is asset-agnostic: it guards positivity (`value <= 0`) and integer-part magnitude (`> Number.MAX_SAFE_INTEGER`) but never checks fractional-digit count against the asset's decimals. Every fund-moving verb resolves the asset at the SAME call site as the amount (swap `util.ts:148-151` resolveAsset+parseAmount; lend `runLendAction.ts:64-80`; borrow `open.ts:21-25` / `deposit-collateral.ts:20`), so decimals ARE available but unused. The SDK does not close the gap (`utils/validation.ts` has no decimal-precision check before `parseUnits(amount, asset.decimals)`). Separately, `parseDecimal` returns `value = Number(raw)` (`parseDecimal.ts:23`), so a high-precision typed amount (>~15-16 significant digits) is rounded by the float coercion before the SDK re-parses. viem's `parseUnits` silently ROUNDS excess fractional digits rather than throwing, so `--amount-in 0.0000001` on 6-decimal USDC, or any over-precise borrow/lend amount, is silently converted to a different on-chain value (down to 0) with no CLI error. The output envelopes echo the user's TYPED number, not the rounded on-chain amount: swap `printOutput.ts:42-53` prints the SDK's actual `result.amountIn`, but lend (`runLendAction.ts:96-107`) and borrow (`open.ts:40-43`, `runBorrowAction.ts:143`) echo the parsed typed number — so an agent reading `--json` sees the requested value, not what moved.
- **Exploit/repro:** `actions wallet swap execute --in USDC_DEMO --out OP_DEMO --amount-in 0.0000001 --chain base-sepolia` — USDC_DEMO has 6 decimals, viem rounds `0.0000001` to 0 raw, the swap dispatches a ~zero input (or reverts) yet the CLI accepted the flag with no validation error. `actions wallet lend open --market gauntlet-usdc --amount 1.0000000000000000001` (18-dec) — the trailing digits are lost in `Number(raw)`; the SDK signs `parseUnits("1", 18)`, not the typed value.
- **Recommendation:** In `parseAmount` (or at the `buildSwapInputs` / `runLendAction` / borrow handler call sites where the Asset is already resolved) reject an amount whose fractional-digit count exceeds `asset.metadata.decimals` with a `CliError('validation')` before dispatch; alternatively canonicalize via `formatUnits(parseUnits(raw, decimals), decimals)` and echo THAT canonical value in the envelope so the printed amount matches the on-chain amount.
- **suggestRefactor:** false
- **Candidate issue:** #419
- **Dedup:** NEW (the float round-trip framing from surface 4, `parseDecimal.ts:23`, is folded in as the input-side facet of the same root cause; input-side analogue of the `refines:F252` serializer type-lie boundary)

#### F335 — `--slippage 0` passes CLI + SDK validation and is honored as a strict 0% tolerance, not coerced to the default — `low` / `correctness` — NEW

- **File:** `packages/cli/src/utils/parseSlippage.ts:9-15`
- **Detail:** `parseSlippage` delegates shape to `parseDecimal` (which accepts 0, only rejecting `< 0`) and returns `0 / 100 = 0` — a value that is `!== undefined`, so `buildSwapInputs` (`util.ts:160`) forwards `slippage: 0` to the SDK. The SDK resolves it with `params.slippage ?? this.defaultSlippage` (`SwapProvider.ts:271,449,461`), so 0 is taken literally, NOT replaced by the default, and `validateSlippage(0, max)` passes (`validation.ts:111-113` only rejects `< 0` / `> max`). Result: `amountOutMin == amountOut` (zero protective band): any block-to-block price drift makes the swap revert on-chain (wasted gas, opaque exit) rather than getting a clean CLI error. Protective (no fund loss) but indistinguishable from a typo (user meant to omit the flag). The sibling amount parsers (`parseAmount.ts:22`) explicitly reject `<= 0`, so this is also an inconsistent-validation gap across siblings.
- **Exploit/repro:** `actions wallet swap execute --in USDC_DEMO --out OP_DEMO --amount-in 10 --slippage 0 --chain base-sepolia` — forwarded as slippage 0, SDK sets `amountOutMin == amountOut`, the swap reverts on any adverse tick instead of erroring at parse time.
- **Recommendation:** In `parseSlippage`, treat a parsed `0` as a validation error (slippage must be `> 0`) for parity with the amount parsers, OR document/justify that 0 means strict no-slippage. A floor check is a one-line, low-risk addition.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to:** F330 (the deadline analog — a numeric swap knob whose lower extreme silently produces a degenerate signed value with no CLI sanity check)
- **Dedup:** NEW

#### F336 — No unit tests cover the CLI parse layer that gates every fund-moving amount, slippage, and signed deadline into the SDK — `low` / `info` — NEW

- **File:** `packages/cli/src/utils/parseAmount.ts:1-28` (and `parseDecimal` / `parseSlippage` / `parseDeadline` / `parseApprovalMode`)
- **Detail:** `grep` across `packages/cli/src` finds zero test files referencing `parseAmount`, `parseDecimal`, `parseSlippage`, `parseApprovalMode`, or `parseDeadline` (`util.ts:99`). These functions are the entire validation boundary between loosely-typed commander argv and the signed SDK params: `parseAmount`'s MAX_SAFE_INTEGER / positivity guards, `parseDecimal`'s scientific-notation/hex/sign/whitespace rejection, `parseSlippage`'s percent→decimal conversion, `parseDeadline`'s positive-integer check. A regression in any (e.g. accepting a negative amount, mis-converting slippage, dropping the magnitude guard) would silently change what value gets signed on-chain, and nothing in the suite would fail. The command `__tests__` exercise only read-only market/quote commands; no test drives a write verb's amount-parsing path. The only util test is `receipts.test.ts`.
- **Exploit/repro:** `grep -rln 'parseAmount|parseDecimal|parseSlippage|parseApprovalMode' packages/cli/src | grep test` returns nothing.
- **Recommendation:** Add focused unit tests for `parseAmount` (zero, negative, `> MAX_SAFE_INTEGER`, scientific notation, hex, excess decimals), `parseSlippage` (0, negative, `> 50%`), `parseDeadline` (past/future, millisecond magnitude), and `parseDecimal` edge cases. Tests should encode WHY each guard exists (a malformed value must never reach the signed SDK call).
- **suggestRefactor:** false
- **Candidate issue:** #335
- **Relates to:** F252
- **Dedup:** NEW

#### (refines:F333) — `lend close --max` against a zero/empty position throws a misleading `Invalid --amount: 0` naming a flag the user never passed — `low` / `correctness` — REFINES:F333

- **File:** `packages/cli/src/commands/wallet/lend/runLendAction.ts:76-80`
- **Detail:** For `close --max`, `runLendAction` reads `wallet.lend.getPosition().balanceFormatted` and routes it through `parseAmount(balanceFormatted)` with NO flag argument, so `parseAmount` falls back to its default flag label `--amount`. When the position balance is `0` (no open position, or already closed), `balanceFormatted` is `'0'`, `parseAmount` rejects it via `value <= 0` and throws `CliError('validation', 'Invalid --amount: 0 ...')`. The user invoked `lend close --max` and never supplied `--amount`, so the error names a non-existent flag and an internally-derived value, masking the real condition (nothing to close). Same snapshot-balance mechanism as F333; distinct UX/error-clarity gap on the same path. The borrow `--max` siblings avoid this because they pass the SDK `{max:true}` sentinel and never re-parse a formatted balance.
- **Exploit/repro:** `actions wallet lend close --market gauntlet-usdc --max` with no open position emits `Invalid --amount: 0 (expected a positive decimal...)` though `--amount` was never passed.
- **Recommendation:** Detect an empty/zero position before `parseAmount` and surface a clear `CliError` (e.g. `No open lend position to close in <market>`), or pass an explicit flag label (`--max`). Low-risk error-message fix; the deeper parity fix is tracked by F333/#334.
- **suggestRefactor:** false
- **Candidate issue:** #334
- **Dedup:** REFINES:F333 (sharpens the lend `--max` error-clarity angle)

#### (refines:F333) — Lend `close --max` re-derives the withdraw amount from a float-formatted balance, leaving wei-scale dust; not a true full-balance path — `low` / `correctness` — REFINES:F333

- **File:** `packages/cli/src/commands/wallet/lend/runLendAction.ts:76-80`
- **Detail:** For `lend close --max`, `runLendAction` reads `balanceFormatted` (a full-precision string) and passes it through `parseAmount`, which collapses it to a float via `Number(raw)` (`parseDecimal.ts:23`), then dispatches that float as the fixed `amount` to `wallet.lend.closePosition`. Unlike the borrow side, which forwards a real `{ max: true }` AmountOrMax to the SDK, lend has no max path: the SDK `closePosition` only accepts a human-readable `amount` (`LendProvider.ts:195-227`) and re-parses via `parseUnits(amount.toString(), decimals)`. The float round-trip on an 18-decimal `balanceFormatted` can drop low-order wei, so `--max` withdraws slightly less than the true balance and leaves dust. The inflight-interest race is documented in the comment (`runLendAction.ts:71-75`) but the float-precision dust is a separate, undocumented effect. Direction is safe (under-withdraw won't revert from over-withdraw), so correctness/dust, not fund-loss.
- **Exploit/repro:** Open a lend position with an 18-decimal token, then `actions wallet lend close --max`: the withdrawn amount equals `Number(balanceFormatted)`, which can be `< the on-chain balance` by a few wei, leaving a non-zero residual position.
- **Recommendation:** Document the precision-loss dust alongside the existing interest-accrual note, or pass `position.balance` (raw bigint) through to the SDK once a `*Raw` close path exists (#379). Flag as backlog so the lend/borrow max-semantics divergence is intentional and recorded.
- **suggestRefactor:** false
- **Candidate issue:** #379
- **Dedup:** REFINES:F333 (adds the float-precision-dust mechanism to F333's snapshot-vs-`{max:true}` parity gap)

#### F337 — `amountOrMaxToEnvelope` silently maps the SDK `{ amountRaw }` shape to `undefined`, so a raw-amount leg would echo a blank amount in the borrow envelope — `low` / `info` — NEW

- **File:** `packages/cli/src/commands/wallet/borrow/runBorrowAction.ts:81-88`
- **Detail:** `amountOrMaxToEnvelope` handles only the `{ max }` and `{ amount }` variants of the `AmountOrMax` union and returns `undefined` for anything else (line 87), with a comment that `amountRaw` is intentionally not handled because "the CLI never builds it". That holds today (every borrow handler builds `{amount}` or `{max}`), so not currently exploitable. But the function is the single projection from the SDK union into the user-facing envelope; if a future leg ever passes `{amountRaw}` (the SDK type permits it) the envelope would print NO amount for a fund-moving leg while the tx still dispatches the raw amount — a silent observability hole on a write verb's confirmation output.
- **Exploit/repro:** Static: `amountOrMaxToEnvelope` returns `undefined` for `{amountRaw}`; the borrow `printOutput` formatter (`printOutput.ts:238-242`) then omits the amount entirely from the receipt line.
- **Recommendation:** Add an explicit `if ('amountRaw' in value) return value.amountRaw.toString()` (or a throw) branch so a future raw-amount leg cannot silently render a blank amount. Strictly defensive; no behavior change today.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup:** NEW

---

### Surface: cli — key/secret surface & redactor

#### F338 — Redactor SENSITIVE_KEYS denylist omits transaction/data/value/to/mnemonic/seed; any string property of a thrown `cause` survives verbatim — `medium` / `info` — NEW

- **File:** `packages/cli/src/output/errors.ts:181-191, 219-252`
- **Detail:** `redactRecord` decides what to drop purely by FIELD NAME via `SENSITIVE_KEYS` (account/address/from/headers/privateKey/publicKey/request/signer/signature). Every other key whose value is a string is KEPT after only `redactUrls` (strips http(s) only) — confirmed by the existing test which preserves `unknownScalar: 'drop-me'` (`errors.test.ts:131`; the test comment is wrong, the string is NOT stripped). `toCliError` stores the RAW caught error as `details: { cause: err }` on both the onchain (`errors.ts:130`) and network-fallback (`errors.ts:133`) paths, and `wallet/balance.ts:27` does the same. When `err` is NOT a viem `BaseError` (so not reduced to `{errorName, shortMessage}`), `redactRecord` recurses through ALL its enumerable own properties. SENSITIVE_KEYS does not list `transaction`, `rawTransaction`, `serializedTransaction`, `data`, `value`, `to`, `params`, `body`, `args`, `mnemonic`, or `seed`, so a thrown error object carrying any of those as a string (a raw signed tx, calldata, or a seed phrase from a custom/wrapped error or a future non-viem signing path) lands verbatim in stderr and the `--json` error envelope that agents/CI capture. General form of F328 (the specific `parseSigner` `reason` instance) and structural inverse of F332.
- **Exploit/repro:** `throw Object.assign(new Error('sign failed'), { transaction: '0x02f8...<raw-signed-tx>' })` inside a wallet write handler. `toCliError` → network path → `details: { cause: <that error> }`; `safeDetails` → `redactValue` (not a BaseError, object branch) → `redactRecord` recurses: `cause` not in SENSITIVE_KEYS, `transaction` not in SENSITIVE_KEYS and is a string → kept after `redactUrls`. The raw signed tx appears in the `--json` stderr envelope.
- **Recommendation:** Make the redactor value-aware: drop any string value matching a high-entropy hex pattern (`/0x[0-9a-fA-F]{40,}/`) and any BIP39-looking phrase, regardless of key, in addition to the URL strip. At minimum add `transaction`, `rawTransaction`, `serializedTransaction`, `data`, `mnemonic`, `seed`, `body`, `params`, `args` to SENSITIVE_KEYS.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to:** F328
- **Dedup:** NEW (the general value-shape gap; F328 is the specific `parseSigner reason` instance)

#### F339 — Redactor has no recursion-depth or cycle guard; a non-BaseError thrown value with a circular reference crashes the last-resort error reporter — `low` / `correctness` — NEW

- **File:** `packages/cli/src/output/errors.ts:197-252, 309`
- **Detail:** `redactValue` (197-207) and `redactRecord` (219-252) recurse into nested objects/arrays with no depth cap and no visited-set (`WeakSet`) cycle guard. viem `BaseError` instances are flattened to `{errorName, shortMessage}` so they are safe, but `toCliError` (130,133) and `wallet/balance.ts:27` stash arbitrary thrown values under `details: { cause: err }`. A thrown plain object (or custom error) with a circular reference — common when an error attaches a request/response/transaction object that back-references it — is NOT a BaseError, so it falls into the recursive object branch and recurses until `RangeError: Maximum call stack size exceeded`. This throws inside `safeDetails` during `writeError` (309), the process-level last-resort handler wired to `unhandledRejection`/`uncaughtException` (`index.ts:20-24,60`). The crash happens while reporting another error, so the original failure is masked and the process exits on an unhandled stack overflow instead of emitting the structured envelope.
- **Exploit/repro:** `const e: any = new Error('x'); e.self = e; writeError(toCliError(e))` — `toCliError` wraps to network with `details:{cause:e}`; `safeDetails` → `redactRecord` on `cause` (plain Error, not reduced; its enumerable `self` self-references) recurses infinitely → `RangeError` thrown from `writeError`.
- **Recommendation:** Add a depth limit and a `WeakSet` of visited objects to `redactValue`/`redactRecord`, returning a `[truncated]`/`[circular]` marker when exceeded. Low-risk, contained to the redactor.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to:** F328
- **Dedup:** NEW

#### F340 — PRIVATE_KEY is read and cached in module memory for the process lifetime; no scrub after signer derivation — `low` / `info` — NEW

- **File:** `packages/cli/src/config/env.ts:13-49`
- **Detail:** `requireEnv('PRIVATE_KEY')` (43-49) reads from the lazily-populated module-level `cache: CliEnv` (13-22) which holds the raw private-key string for the entire subprocess lifetime, and `walletContext` keeps the derived value flowing through `parseSigner` (`walletContext.ts:39`). The cached string is never cleared after `privateKeyToAccount` consumes it, so the secret remains resident and is reachable by anything that later reads `process.env.PRIVATE_KEY` or the `cache` closure (core dump, heap snapshot, debug print of `process.env`). For a short-lived CLI subprocess this is acceptable and matches the documented model (`env.ts:25-30`), so recorded as info only. Noted alongside the redactor findings because the same raw string is the value the redactor must never echo.
- **Recommendation:** No code change for the subprocess model; documented as info. If the CLI ever grows a long-lived/REPL mode (#411/#422), zero the cached key after signer construction.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup:** NEW

---

### Surface: cli — resolvers, output, serialization

#### F341 — Redactor string-value branch runs before SCALAR_ALLOWLIST, so every non-sensitive string key is emitted verbatim (URL-strip only); the allowlist is a no-op for strings — `low` / `info` — NEW

- **File:** `packages/cli/src/output/errors.ts:234-237 (string branch), 167-179 (SCALAR_ALLOWLIST), 259-261 (docstring)`
- **Detail:** In `redactRecord` the `typeof raw === 'string'` branch (234-237) executes BEFORE the SCALAR_ALLOWLIST gate (238-241). Any string-valued detail whose key is not in SENSITIVE_KEYS is preserved with only `redactUrls` applied (strips http(s) only, never high-entropy hex / bearer tokens / mnemonics). The redactor's own test asserts this — `unknownScalar: 'drop-me'` is preserved (`errors.test.ts:131`). The SCALAR_ALLOWLIST only ever gates non-string scalars (number/boolean/bigint, 242-249). This is the structural root of F328: `parseSigner`'s `reason: cause.message` (`walletContext.ts:22`) leaks not merely because `reason` is allowlisted, but because the string branch is a global passthrough — the allowlist is irrelevant for strings. The docstring at 259-261 ("unknown scalars are preserved only when their key is in SCALAR_ALLOWLIST") is therefore inaccurate.
- **Exploit/repro:** Standalone reproduction of `redactRecord`: any string-valued non-sensitive key passes through (URL-strip only) before the allowlist check ever runs.
- **Recommendation:** Either (a) deny-list by VALUE shape for strings (redact tokens matching `0x[0-9a-f]{40,}` / long-hex / bearer regardless of key), or (b) invert the policy so unknown string keys are dropped unless allowlisted, the same way non-string scalars are gated. At minimum, correct the docstring.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to:** F328
- **Dedup:** NEW (the ordering/allowlist-no-op-for-strings root, distinct from F338's denylist-omissions framing)

#### (refines:F332) — F332 partially refuted: string-typed recipient/to/spender are already preserved by the redactor, not dropped — `low` / `info` — REFINES:F332

- **File:** `packages/cli/src/output/errors.ts:234-237, 167-191`
- **Detail:** F332 claims the redactor strips `recipient`/`to`/`spender` (the non-secret destination fields an operator needs for a post-mortem) because none are in SCALAR_ALLOWLIST, and recommends adding them to a non-secret allowlist. Verified against code and a standalone reproduction: address-typed `to`/`recipient`/`spender` are STRING values, so they hit the string branch (234-237) and pass through (URL-strip only) BEFORE the SCALAR_ALLOWLIST check. They are preserved today in their normal (string) form; F332's gap only manifests if such a field were a non-string scalar, which addresses never are. The inverse holds: `from`/`account`/`signer`/`address` ARE dropped (SENSITIVE_KEYS) even as strings, which is correct.
- **Recommendation:** Demote/close the F332 "add recipient/to/spender to allowlist" action as unnecessary for string values. If a structured (object) destination field is ever introduced, re-evaluate. No code change required for the string case.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup:** REFINES:F332 (partial refutation: the destination-context preservation F332 wants is already in place for strings)

#### F342 — resolveAsset silently returns first symbol match while sibling market resolvers throw on ambiguity — wrong-token selection on the fund-moving swap `--in`/`--out` path — `low` / `correctness` — NEW

- **File:** `packages/cli/src/resolvers/assets.ts:27-39`
- **Detail:** `resolveAsset` uses `allow.find(...)` (assets.ts:29) and returns the FIRST asset whose `metadata.symbol` matches case-insensitively. The sibling resolvers `resolveMarket` (`markets.ts:44-56`) and `resolveBorrowMarket` (`borrowMarkets.ts:48-60`) deliberately throw `CliError('validation','Ambiguous ...')` when two entries normalize to the same key, with the comment "the agent would otherwise silently pick whichever appears first in iteration order." `resolveAsset` has no such guard and no ambiguity test (`assets.test.ts` covers exact/case-insensitive/unknown/empty only). It feeds the swap execute path via `buildSwapInputs -> resolveAsset(flags.in/out)` (`commands/actions/swap/util.ts:148-149`), building the signed `WalletSwapParams`. The demo config has unique symbols today, but the resolver is config-agnostic; in a config with duplicate same-symbol assets, `--in USDC` silently selects the first-listed token address — a different ERC-20 than intended — and the swap is built and signed against it.
- **Exploit/repro:** A config surfacing two assets with symbol `USDC` (e.g. a mock `USDC_DEMO` and a real `USDC`, or the same symbol on two chains/addresses): `--in USDC` resolves to whichever appears first in iteration order, with no ambiguity error.
- **Recommendation:** Mirror `resolveMarket`/`resolveBorrowMarket`: collect all symbol matches, throw `CliError('validation','Ambiguous asset: <symbol>')` when more than one matches (listing name+chainId+address), keep first-match only when exactly one. Add an ambiguity test.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup:** NEW

#### F343 — resolveChainId uses loose Number() coercion (accepts hex/scientific/whitespace/signed) — inconsistent strictness vs the amount/decimal parsers — `low` / `info` — NEW

- **File:** `packages/cli/src/resolvers/chains.ts:70-89`
- **Detail:** `resolveChainId` parses via `Number(raw)` then `Number.isInteger(parsed) && parsed > 0` (74-75). `Number()` accepts forms the deliberately-strict amount parsers reject: `0x14a34` (hex → 84532), `8.4532e4` (scientific), `84532.0`, ` 84532` (leading whitespace), `+84532`, `084532` all pass. By contrast `parseDecimal`/`parseAmount` route through viem `parseUnits` specifically to reject scientific notation, hex, signs, whitespace, and `parseDeadline` enforces `/^[1-9]\d*$/`. No fund-safety impact here: the parsed value is checked for membership in `configuredChainIds` (82), a tight allowlist, and a hex/scientific form that resolves to a configured id resolves to the SAME `SupportedChainId`. Strictness-consistency observation, not a vulnerability; could mask a typo (a fat-fingered hex-looking value still "works").
- **Exploit/repro:** `actions <cmd> --chain-id 0x14a34` (or `1e5` if 100000 were configured) is accepted and resolves via `Number()` coercion; the same value as a shortname would have to match exactly.
- **Recommendation:** Optional: tighten `resolveChainId` to `/^[1-9]\d*$/.test(raw)` before `Number()` for parity with `parseDeadline`/`parseAmount`, so malformed-but-coincidentally-coercible chain ids fail with a clean validation error. Allowlist membership already prevents any wrong-chain selection.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Dedup:** NEW

#### (dup:F252) — writeJson routes every success doc through serializeBigInt's stringify→parse→stringify round-trip; the bigint→string type-lie at the CLI stdout sink — `low` / `correctness` — DUP:F252

- **File:** `packages/cli/src/output/json.ts:14-16 (writeJson)`; `packages/sdk/src/utils/serializers.ts:15-21`
- **Detail:** `writeJson` (`json.ts:15`) calls `JSON.stringify(serializeBigInt(doc), null, 2)`; `serializeBigInt` itself does `JSON.stringify(replacer)→JSON.parse` (`serializers.ts:16-20`), a triple JSON pass per command output. The documented type-lie lands here: `amountInRaw`/`amountOutRaw` (`printOutput.ts:94-95`), `balanceRaw`, `shares`, and every bigint amount are emitted as decimal STRINGS while the SDK return types still claim bigint. An agent consuming `--json` that assumes JSON numbers will mis-handle fund amounts. This re-anchors the existing `(refines:F252)` row from pass 16 (`writeJson`/`writeError` already flagged); recorded here to re-anchor it to the success-output path and note the redundant double-serialize cost.
- **Recommendation:** No new CLI-side fix beyond #419. When the SDK serializer is typed (`Serialized<T>` with string-typed bigint fields), re-verify CLI envelopes round-trip. Optionally drop the redundant inner `JSON.parse` by having `writeJson` stringify once with a bigint replacer.
- **suggestRefactor:** false
- **Candidate issue:** #419
- **Dedup:** DUP:F252 (the existing `(refines:F252)` pass-16 row already covers `writeJson`/`writeError`; no new ledger row)

---

### Surface: cli — wallet send/transfer-equivalent verbs (end-to-end)

#### (refines:F327) — `swap execute` success envelope omits the resolved recipient even though `--recipient` can redirect output; no post-trade confirmation of where funds went — `low` / `info` — REFINES:F327

- **File:** `packages/cli/src/output/printOutput.ts:330-335`
- **Detail:** `formatSwapExecute` (330-335) and the `SwapExecuteDoc` type (88-99) never include a recipient field, and the dispatch in `execute.ts:42-53` does not read `result.recipient` into the envelope. When the operator passes `--recipient <addr|ens>` (`wallet/swap/index.ts:38-40`), the executed swap can send output tokens to a non-wallet address on the providers that honor it, yet neither stdout text nor the `--json` doc echoes the resolved destination. This is the post-send half of the recipient-visibility gap; F327 covered the pre-send passthrough/echo and the SDK-validation no-op. An agent/operator parsing the success envelope has no machine-readable confirmation of the recipient that actually received funds.
- **Exploit/repro:** `actions wallet swap execute ... --recipient 0x<attacker> --json` returns a success doc with `assetOut`/`amountOut` but no recipient field; nothing in the output reveals the funds left the wallet.
- **Recommendation:** Add the SDK-resolved recipient (`result.recipient`, already on `SwapQuote`/execute result) to `SwapExecuteDoc` and `formatSwapExecute` so the success envelope confirms the destination. Pairs with the F327 pre-send echo recommendation.
- **suggestRefactor:** false
- **Candidate issue:** #435
- **Dedup:** REFINES:F327 (output-serialization-layer instance of the recipient family — the post-send half)

---

## Dedup ledger summary

| Incoming | Decision | ID |
|----------|----------|-----|
| Amount not validated vs asset decimals + envelope echo (parseAmount) | new | F334 |
| Amount float round-trip Number(raw) before SDK parseUnits (parseDecimal) | folded into F334 | — |
| `--slippage 0` honored as strict 0% (parseSlippage) ×2 surfaces | new (consolidated) | F335 |
| No unit tests on CLI parse layer | new | F336 |
| `lend close --max` misleading `Invalid --amount: 0` | refines:F333 | — |
| `lend close --max` float-formatted balance leaves dust | refines:F333 | — |
| amountOrMaxToEnvelope maps {amountRaw}→undefined | new | F337 |
| Redactor SENSITIVE_KEYS omits transaction/data/mnemonic/seed | new | F338 |
| Redactor no depth/cycle guard | new | F339 |
| PRIVATE_KEY cached in module memory | new | F340 |
| Redactor string branch precedes SCALAR_ALLOWLIST (allowlist no-op for strings) | new | F341 |
| F332 partially refuted (string recipient/to/spender already preserved) | refines:F332 | — |
| resolveAsset first-match vs sibling ambiguity throw | new | F342 |
| resolveChainId loose Number() coercion ×2 surfaces | new (consolidated) | F343 |
| writeJson serializeBigInt round-trip / type-lie at stdout sink | dup:F252 | — |
| swap execute envelope omits resolved recipient | refines:F327 | — |
