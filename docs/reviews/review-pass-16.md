# Review Pass 16 — CLI (senior-security, review-only)

**Pass:** 16
**Skill:** engineering-skills:senior-security (review-only)
**Surfaces:** `packages/cli/src/**` — four independent senior-security sub-reviews of the Actions CLI, all through a fund-safety lens:
1. Arg parsing into SDK params, recipient passthrough, key handling, pre-send echo (`commands/actions/swap/util.ts`, `commands/wallet/**`, `context/`, `output/`).
2. Key/mnemonic handling, secret/log exposure, recipient passthrough, approval-mode defaults, resolver/arg trust (`context/walletContext.ts`, `output/{errors,printOutput,json}.ts`, `commands/`).
3. `resolvers/`, `output/`, `utils/`, `context/`, `config/`, `commands/` — redactor allowlist, serializeBigInt boundary, recipient precheck.
4. `demo/`, `wallet/`, `context/`, `config/`, `output/`, `utils/`, `commands/` — Velodrome recipient-ignored exposure, deadline units, lend-vs-borrow `--max` parity.

## Summary

8 findings this pass: **7 NEW** (F327–F333), **1 REFINES** (F252). No dups.

This is the **first CLI-focused pass**; there were no prior `cli` rows in the ledger. The four sub-reviews converged independently, so most incoming items are the same underlying finding reported up to four times — consolidated below.

By severity (consolidated):
- **medium:** 2 (F327 swap `--recipient` raw passthrough; F328 parseSigner echoes viem error into `details.reason`).
- **low:** 6 (F329 no pre-send echo; F330 `--deadline` no sanity bound; F331 chains prints rpcUrls verbatim; F332 redactor allowlist suppresses destination fields; F333 lend `close --max` vs borrow `{max:true}` parity; refines:F252 serializeBigInt at CLI boundary).

By class: malicious-sign 2, correctness 3, info 3.

Notable highlights:
- **F327 (medium, malicious-sign):** `wallet swap execute --recipient` is forwarded RAW into the SDK with zero CLI-side `isAddress`/zero-address precheck and **never echoed before or after signing**. It rides directly on the SDK recipient-family bugs (F043/F046/F052/F066/F183, #444/#437): on Velodrome universal/CL routes the recipient is silently ignored (output lands in the signer wallet) while on Velodrome v2/leaf routes it IS honored in calldata, so a typo'd/poisoned/zero recipient routes output to the wrong address — and the CLI prints only `swapped X for Y` with no recipient field, so an operator/agent cannot verify destination at any point. One sub-reviewer rated the Velodrome-advertises-but-ignores angle **high/fund-loss** because the CLI's baked demo config enables Velodrome and the flag promises behavior the calldata does not deliver.
- **F328 (medium, malicious-sign):** `parseSigner` puts viem's raw `cause.message` into `CliError('config').details.reason`; the redactor only URL-strips strings and `reason` is in `SCALAR_ALLOWLIST` (not `SENSITIVE_KEYS`), so a malformed `PRIVATE_KEY` value that viem echoes can land verbatim in stderr and the `--json` error envelope — the only secret the CLI touches crossing into formatted output an agent captures.
- **F329 (low, info):** No pre-send echo / `--dry-run` / `--yes` before ANY fund-moving verb (swap execute, lend/borrow open/close/repay/deposit/withdraw); every write dispatches sign+broadcast immediately, so a mis-parsed `--chain`/`--market`/`--amount`/`--recipient`/`--approval-mode max` is irreversible with no checkpoint. The natural home to surface F327's recipient destination.

Strengths recorded (no findings): `PRIVATE_KEY` is the only secret, read lazily via envalid only inside `walletContext`, never logged; `wallet address` prints only the derived public address; no mnemonic support; the error pipeline (`output/errors.ts`) strips every `http(s)` URL (RPC API-key defense) and drops a `SENSITIVE_KEYS` set (signer/privateKey/from/account/headers/request) and reduces viem errors to `{errorName, shortMessage}`; success output is a key-free structured envelope. Amount/slippage/decimal parsers reject scientific notation, hex, signs, whitespace, zero, and `> MAX_SAFE_INTEGER`. Markets/assets/chains resolve against the config allowlist with ambiguity surfaced. Default approval mode is the safe `exact`; `--max` is opt-in and SDK-allowlist-validated. No raw `wallet send/sendBatch/transfer` command exists yet (#413 unbuilt), so the classic free-recipient-into-transfer surface (#444) does not exist at the CLI; the only recipient passthrough is the swap `--recipient` flag (F327). RPC URLs / baked demo config trust is recorded as the accepted integrator-supplies-RPC assumption.

---

## Surface — cli

### F327 — `wallet swap execute --recipient` is forwarded raw to the SDK with no CLI-side validation and never echoed before/after signing
- **Surface:** cli
- **File:** `packages/cli/src/commands/actions/swap/util.ts:118-128` (`buildWalletExecuteParams`); flag registered `packages/cli/src/commands/wallet/swap/index.ts:37-40`; dispatched `packages/cli/src/commands/wallet/swap/execute.ts:33-53`; output `packages/cli/src/output/printOutput.ts:88-99,312-320,330-335`
- **Severity:** medium · **Class:** malicious-sign
- **Status:** NEW (relates F046, also F043/F052/F066/F183)
- **Detail:** `buildWalletExecuteParams` casts `flags.recipient` straight to `WalletSwapParams['recipient']` (util.ts:121) with an inline comment deferring all validation to the SDK. The CLI performs **no** `isAddress`/non-empty/zero-address precheck of its own. On the execute path the recipient flows through `WalletSwapNamespace.resolveRawParams` (resolves ENS/address but does NOT run `requireQuoteForThisWallet`, which only fires on the pre-built-quote branch) into `BaseSwapNamespace.resolveRecipient`, whose only guard is `validateRecipient` — a no-op for any value that is not a valid 20-byte address (`isAddress(recipient)` false), so `0xDEADBEEF` / `0x1234` / a typo'd checksum / a non-ENS string bypasses validation and reaches the ENS resolver, where the verbatim-hex branch returns the input with **no EIP-55 checksum and no zero-address guard** (F043/F254). Net at the CLI: a malformed/typo'd/poisoned/zero `--recipient` either resolves verbatim and routes swap OUTPUT to the unintended address, or fails deep in the resolver as an opaque error instead of a clean CLI `validation` error. Compounding this, the CLI **never prints the resolved recipient** — `formatSwapExecute`/`SwapExecuteDoc` and even read-only `formatSwapQuote` omit it though `SwapQuote.recipient` exists — so neither the pre-send path nor the success envelope lets an operator/agent verify destination before or after signing. On Uniswap V4 / Velodrome universal+CL routes the SDK silently ignores the recipient (#444 / F046) and funds land in the signer wallet regardless; on Velodrome v2/leaf routes the recipient IS baked into calldata (F079), so a wrong/poisoned value silently sends output to the attacker with zero on-screen confirmation. This is the CLI half of the recipient family and the only recipient passthrough in the CLI; it adds zero compensating control.
- **Exploit/repro:** `actions wallet swap execute --in USDC_DEMO --out OP_DEMO --amount-in 10 --chain base-sepolia --provider velodrome --recipient 0x<poisoned-lookalike>` on a v2/leaf route routes output to the poisoned address; the CLI prints only `swapped 10 USDC_DEMO for N OP_DEMO (price=...)` with no recipient shown. With `--recipient 0xDEADBEEF`, `validateRecipient` is a no-op and the value flows to the ENS resolver (errors deep, or resolves verbatim for a length-valid checksum-less hex). With Velodrome selected and `--recipient 0xSomeoneElse`, output lands in the signer wallet and the JSON envelope reports exit-0 success — the flag promises behavior the calldata does not deliver.
- **Recommendation:** Two cheap, review-only CLI guards. (1) Pre-check in `buildWalletExecuteParams`: when `flags.recipient` is set and is NOT an ENS name, require viem `isAddress(recipient, { strict: true })` (checksummed) and reject the zero address with `CliError('validation')` before dispatch; leave ENS resolution in the SDK. (2) Echo the resolved recipient (and whether it differs from the wallet) in the swap execute (and ideally quote) output envelope — add a `recipient` field to `SwapExecuteDoc` and print it in `formatSwapExecute`. Optionally gate `--recipient` behind `--provider uniswap` (or reject `recipient != wallet` when Velodrome may be selected) until the SDK #444 fix lands. The deeper recipient-vs-calldata mismatch is owned by the SDK findings (F046/F183, #444/#437) and should be cross-referenced, not re-fixed at the CLI layer.
- **suggestRefactor:** false · **Candidate issue:** #444
- **Dedup:** Reported by all four sub-reviews (medium ×3; one rated the Velodrome-advertises-but-ignores angle high/fund-loss because the CLI's baked demo config enables Velodrome). Consolidated as one NEW medium finding with the high-severity sub-angle noted.

### F328 — parseSigner echoes viem's PRIVATE_KEY parse error into `details.reason`, which the redactor does not strip
- **Surface:** cli
- **File:** `packages/cli/src/context/walletContext.ts:15-25` (`parseSigner`); redactor `packages/cli/src/output/errors.ts:176,181-191,219-252`
- **Severity:** medium · **Class:** malicious-sign
- **Status:** NEW (relates F296)
- **Detail:** On a malformed `PRIVATE_KEY`, `parseSigner` wraps `privateKeyToAccount` and throws `CliError('config', ..., { reason: cause instanceof Error ? cause.message : String(cause) })` (walletContext.ts:22). viem 2.x echoes the offending input value in its hex/bytes parse errors (`hexToBytes`/`InvalidHexValueError`/size errors include the value being parsed), so for a malformed-but-partially-correct key the raw value can appear in `cause.message`. That message flows to `writeError -> safeDetails -> redactRecord`, whose string branch applies ONLY `redactUrls` (strips `http(s)` URLs, never high-entropy hex), and `reason` is in `SCALAR_ALLOWLIST` and NOT in `SENSITIVE_KEYS` (which keys off the field NAME). Net: a malformed `PRIVATE_KEY` can land verbatim in stderr and the `--json` error envelope, which agents/CI commonly capture to logs, files, or chat. This is the only secret the CLI touches and the only place its value crosses into formatted output. viem's CURRENT private-key errors describe the expected shape rather than echoing the bytes, so this is defense-in-depth rather than an active leak today, but the redactor's allowlist would pass through any future/3rd-party error string embedding key-derived material.
- **Exploit/repro:** Set `PRIVATE_KEY` to a malformed value viem echoes (e.g. an odd-length/wrong-size `0x` hex such as `0xdeadbeef`) and run any wallet command with `--json`; the emitted envelope's `details.reason` contains viem's message including the supplied value.
- **Recommendation:** Do not propagate the underlying cause message for the key-parse failure — the static message `Malformed PRIVATE_KEY: expected a 0x-prefixed 32-byte hex string` is self-sufficient; drop the `{ reason: cause.message }` detail (or replace with a non-echoing classifier such as `cause.name`). Optionally add a defense-in-depth `redactRecord` rule masking any 64+ hex-char run in string values before emit. One-line, low-risk.
- **suggestRefactor:** false · **Candidate issue:** none
- **Dedup:** Reported by two sub-reviews (medium and low). Consolidated at medium given it is the sole secret crossing into captured output and the redactor structurally does not defend the value. Relates to F296 (backend env secret-validation gap) but distinct surface and mechanism.

### F329 — No pre-send echo / confirmation before any fund-moving CLI command; transactions dispatch immediately
- **Surface:** cli
- **File:** `packages/cli/src/commands/wallet/swap/execute.ts:38-53` (`runWalletSwapExecute`); `packages/cli/src/commands/wallet/borrow/runBorrowAction.ts:127-149`; `packages/cli/src/commands/wallet/lend/runLendAction.ts:76-93`
- **Severity:** low · **Class:** info
- **Status:** NEW
- **Detail:** Every wallet write verb (swap execute, lend open/close, borrow open/close/repay/deposit-collateral/withdraw-collateral) resolves flags into SDK params and immediately calls the SDK sign+broadcast method, printing the receipt only AFTER the tx has landed. There is no `--dry-run`, no `--yes`/confirmation gate, and no pre-send summary of (resolved from address, recipient, chain, market address, amount, approval mode, slippage, deadline) for the operator to review before the private key signs. `runWalletSwapExecute` calls `wallet.swap.execute(params)` directly (execute.ts:39); `runBorrowAction` calls `buildAndDispatch(wallet, market)` directly (runBorrowAction.ts:128); `runLendAction` calls `openPosition/closePosition` directly (runLendAction.ts:82-93). A `grep` for confirm/dry-run/readline/prompt returns nothing. Approval-mode when omitted silently inherits the SDK/wallet default with no surfaced value. For an agent-driven CLI moving real principal this is a deliberate non-interactive design, but it means a mis-parsed flag, a wrong `--chain`, a `max` approval, or a redirected `--recipient` (F327) is committed on-chain with no checkpoint — the single biggest fund-safety affordance missing from the write path.
- **Exploit/repro:** Any wallet write command (e.g. `actions wallet borrow open --market X --borrow-amount 1000`) signs and broadcasts on first invocation with no confirmation prompt or preview of the resolved parameters.
- **Recommendation:** Backlog (do not block). Add an optional pre-send echo (resolved from/recipient/chain/market/amount/approvalMode/deadline) emitted to stderr before dispatch (preserving the JSON path), and/or a `--yes`/`--dry-run` pair so agents can preview the exact parameters that will be signed. No architectural change required for the default agent path; print the already-resolved params struct. This is the natural place to surface F327's resolved recipient. Maps to the existing CLI guardrails tickets.
- **suggestRefactor:** false · **Candidate issue:** #414
- **Dedup:** Reported by all four sub-reviews (all low/info; cand issues cited as #414 and #413). Consolidated as one NEW low finding.

### F330 — `--deadline` accepts a past Unix timestamp and a 13-digit millisecond value with no future/window/units sanity check
- **Surface:** cli
- **File:** `packages/cli/src/commands/actions/swap/util.ts:99-109` (`parseDeadline`); forwarded as `WalletSwapParams.deadline` (util.ts:122) into `SwapProvider`/`UniswapSwapProvider`
- **Severity:** low · **Class:** correctness
- **Status:** NEW
- **Detail:** `parseDeadline` enforces only `/^[1-9]\d*$/` (a positive integer) and returns `Number(raw)`, then forwards it as the swap deadline. It does NOT check the value is in the future, is within a sane window, or is in seconds vs milliseconds. Two failure modes both reach the signed swap deadline: (a) a PAST timestamp (e.g. `--deadline 1`) is encoded and the router reverts on-chain (wasted gas, surfaced only as an opaque exit 5) rather than the CLI rejecting up front; (b) a 13-digit MILLISECOND value (a common `Date.now()` copy/paste mistake, despite the flag help saying `Unix timestamp in seconds`) becomes a deadline ~31,000 years in the future, which fails OPEN — silently neutering the deadline's staleness/MEV protection so the swap can sit pending and execute at a much-moved price. This is the only numeric swap flag not sanity-bounded against its obvious failure mode (`parseAmount` already applies magnitude guards). Signing-path surface; impact is a revert or weakened protection, not direct fund redirect.
- **Exploit/repro:** `actions wallet swap execute ... --deadline 1` -> accepted, sent as deadline=1 -> guaranteed on-chain revert (exit 5). `actions wallet swap execute ... --deadline 1750000000000` (ms) -> accepted as a ~year-33000 deadline, silently neutering the deadline guard.
- **Recommendation:** In `parseDeadline`, reject values that are not plausibly a near-future second-scale timestamp — require `value > Math.floor(Date.now()/1000)` and `value < now + MAX_DEADLINE_SECONDS`, and reject obviously-millisecond magnitudes (`> ~1e12`) — surfacing a clean `validation` error before any RPC/sign. Alternatively switch the flag to a relative `--deadline-seconds <n>` offset the CLI adds to `now`, removing the units footgun entirely. Low-risk, arg-validation-only.
- **suggestRefactor:** false · **Candidate issue:** none
- **Dedup:** Reported by three sub-reviews (all low; one framed it as past-timestamp, two added the ms-vs-seconds far-future case). Consolidated as one NEW low finding covering both failure modes.

### F331 — `chains` command prints rpcUrls verbatim to stdout/JSON; API keys in RPC URLs leak on the happy path (error path redacts them)
- **Surface:** cli
- **File:** `packages/cli/src/output/printOutput.ts:132-141` (`formatChains`); JSON source `packages/cli/src/commands/actions/chains.ts:13-18` (`runChains` copies `chain.rpcUrls` into `ChainRow`); redactor `packages/cli/src/output/errors.ts:79-84` (`redactUrls`)
- **Severity:** low · **Class:** info
- **Status:** NEW
- **Detail:** `formatChains` writes `rpc=${row.rpcUrls.join(',')}` to stdout (printOutput.ts:138) and the JSON mode emits `rpcUrls` unredacted. The error pipeline goes to lengths to strip every `http(s)` URL because they "frequently embed API keys" (errors.ts:79-84), but the normal `actions chains [--json]` output prints the same `BASE_SEPOLIA_RPC_URL`/`OP_SEPOLIA_RPC_URL` values — which routinely carry an Alchemy/Infura key in the path — in cleartext. Output of a read-only command is the most likely thing an agent pipes to a log/file/share, so this is inconsistent with the error-path redaction policy.
- **Exploit/repro:** `BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/<APIKEY> actions chains --json` -> the API key appears verbatim in stdout, unlike any error path which would redact it.
- **Recommendation:** Backlog/low. Either redact the credential portion of rpcUrls in chains output (reuse `redactUrls`), or print a boolean `rpcOverride: true/false` plus the host (without query/path) rather than the full URL. Do not print the full RPC URL with embedded key.
- **suggestRefactor:** false · **Candidate issue:** none
- **Dedup:** Reported by one sub-review. NEW.

### F332 — Error-detail redactor allowlist can suppress the recipient/spender/to of a failed fund-moving action from the diagnostic envelope
- **Surface:** cli
- **File:** `packages/cli/src/output/errors.ts:181-252` (`safeDetails`/`SENSITIVE_KEYS`/`SCALAR_ALLOWLIST`/`redactRecord`)
- **Severity:** low · **Class:** info
- **Status:** NEW
- **Detail:** `safeDetails` drops keys in `SENSITIVE_KEYS` (includes `account`, `address`, `from`, `signer`) and only preserves unknown scalars when their key is in `SCALAR_ALLOWLIST`. For a write verb that fails after partial execution, the redactor strips an `address`/`from` field and will NOT preserve `recipient`, `to`, `spender`, or `marketId` (none are in the allowlist). These are the user's own non-secret inputs and are exactly the fields an operator needs to confirm WHERE an approval/transfer was targeted when diagnosing a fund-safety incident. The redactor is correctly conservative for secrets (signer/headers/request/privateKey), but the same allowlist suppresses the destination context that makes a malicious-sign post-mortem possible. Reduces diagnosability; does not itself move funds.
- **Exploit/repro:** Trigger a revert on a swap with an explicit `--recipient`; the failure envelope's `details` strips address-typed destination fields, leaving the operator without the resolved recipient/spender in the structured error.
- **Recommendation:** Backlog/low. Add `recipient`, `to`, `spender`, `marketId`, and `transactionHash`/`userOpHash` to a non-secret allowlist so fund-destination context survives redaction (these are addresses/ids the user supplied or already sees in receipts, not credentials). Keep `from`/`account`/`signer` redacted. Low-risk; improves incident response without leaking secrets.
- **suggestRefactor:** false · **Candidate issue:** none
- **Dedup:** Reported by one sub-review. NEW.

### F333 — `lend close --max` snapshots a getPosition balance and dispatches a fixed amount, while borrow `--max` siblings defer to the SDK's on-chain `{max:true}` resolve (parity gap)
- **Surface:** cli
- **File:** `packages/cli/src/commands/wallet/lend/runLendAction.ts:76-93`; sibling `packages/cli/src/commands/wallet/borrow/runBorrowAction.ts` (`resolveAmountOrMax` -> `{max:true}`)
- **Severity:** low · **Class:** correctness
- **Status:** NEW
- **Detail:** For `lend close --max`, the handler reads `wallet.lend.getPosition({marketId}).balanceFormatted`, runs it through `parseAmount`, and dispatches `closePosition` with that fixed `amount`. The code comment acknowledges this races inflight interest accrual, so the dispatched amount may be slightly below the live balance by the time the tx lands (leaving dust) — which is fail-safe (under-shoots, no overdraw). The borrow siblings (repay/withdraw/close `--max`) instead pass the SDK's `{max:true}` full-balance sentinel, which resolves on-chain at dispatch time and avoids the dust. So lend `--max` and borrow `--max` use DIFFERENT mechanisms for the same user-facing `--max` intent: lend snapshots a formatted balance off one getPosition read; borrow defers to the SDK. A validation/parity gap (a sibling does it the safer on-chain-resolve way), not a fund-loss, since the lend path under-shoots.
- **Exploit/repro:** n/a (parity gap, not a single exploit). `lend close --max` on a position accruing interest leaves dust the borrow `--max` path would not.
- **Recommendation:** Backlog/low. If the lend SDK exposes a full-balance/withdraw-all path equivalent to borrow's `{max:true}`, route lend `close --max` through it for parity and to eliminate the documented dust race; otherwise leave as-is (it is fail-safe) and note the intentional divergence. Cross-ref the lend provider-abstraction tickets.
- **suggestRefactor:** false · **Candidate issue:** #334
- **Dedup:** Reported by one sub-review. NEW.

### refines:F252 — serializeBigInt data-loss + type-lie lands on the CLI agent-output boundary
- **Surface:** cli
- **File:** `packages/cli/src/output/json.ts:14-16` (`writeJson`); also `packages/cli/src/output/errors.ts:304` (`writeError`)
- **Severity:** low · **Class:** correctness
- **Status:** REFINES F252 (cross-surface; original at `packages/sdk/src/utils/__tests__/serializers.test.ts`, #419)
- **Detail:** `writeJson` and `writeError` route every successful command document and every error envelope through `serializeBigInt` before `JSON.stringify`. The serializer's data-loss cases (Map/Set -> `{}`, Date -> string, `undefined` dropped) and its type-signature lie (bigint -> string while the return type claims `T`) are already filed as F252/F044 (#419). This refinement records that the CLI is the **primary production consumer** of that boundary: an agent parsing CLI `--json` receives bigint fields (`amountInRaw`, `amountOutRaw`, raw balances) as decimal STRINGS, so any downstream agent arithmetic assuming numbers silently misbehaves on a fund-moving amount. No new CLI-side fix beyond #419; flagged so the CLI envelopes (`amount*Raw`, balances) are re-verified to round-trip when the SDK serializer is hardened/typed.
- **Exploit/repro:** `actions wallet swap execute ... --json` emits `amountInRaw`/`amountOutRaw` as strings; an agent doing numeric math on them without re-parsing gets wrong magnitudes.
- **Recommendation:** No CLI-side fix beyond #419 / F252. When the SDK `serializeBigInt` is hardened/typed, re-verify the CLI envelopes round-trip as documented. Optionally document in CLI output that raw bigint fields are emitted as decimal strings.
- **suggestRefactor:** false · **Candidate issue:** #419
- **Dedup:** Reported by one sub-review as a cross-ref to F252. Recorded as REFINES F252, not a new ID.
