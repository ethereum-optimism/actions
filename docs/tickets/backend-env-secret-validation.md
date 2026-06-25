# Validate signing-critical backend secrets/addresses at boot and remove the Anvil-key default

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | backend |
| **Surface** | `packages/demo/backend/src/config/env.ts` — `SESSION_SIGNER_PK` / `FAUCET_*` / `AUTH_MODULE_ADDRESS` bare `str()`, `FAUCET_ADMIN_PRIVATE_KEY` Anvil `default`, `getFaucetAddressDefault` LOCAL_DEV re-parse + silent fallback |
| **Resolves findings** | F296, F273, F295 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

The demo backend's env schema (`env.ts`) is the single place where every signing-critical secret and on-chain address enters the process, and it is also the only natural fail-fast boundary before those values reach viem signing / RPC calls. Three gaps in that boundary let bad config pass startup and surface late (or never) instead of failing loudly at boot:

1. **No format validation on the signing-critical secrets/addresses.** Private keys and addresses are typed as bare `str()` with no `0x`-hex / 64-char / `isAddress` check, even though a sibling value (`FAUCET_ADDRESS`) is carefully validated. A malformed key (wrong length, missing `0x`, truncated) or a non-address string passes `cleanEnv` and only fails much deeper — inside viem signing or an RPC call mid-request — as an opaque 500 rather than a clear boot-time config error.

2. **A known-compromised key shipped as a production-applicable default.** `FAUCET_ADMIN_PRIVATE_KEY` hard-defaults to the canonical Anvil/Hardhat account-0 key (publicly known across the entire EVM tooling ecosystem) via `default` — which applies in production, unlike sibling secrets that use `devDefault`. The same key is committed verbatim in `.env.example`. The var is currently dead (no runtime consumer), so this is a latent foot-gun rather than live exposure, but it is a globally-known signing key sitting in the admin-key slot that any future wiring would resolve silently when the env var is unset, with the missing-env failsafe never firing.

3. **The faucet-address default silently falls back to a hardcoded address.** `getFaucetAddressDefault()` re-parses `LOCAL_DEV` from `process.env` using envalid's private `bool()._parse(...)` during `cleanEnv` default evaluation (duplicating validation and coupling to an undocumented internal API), and on `LOCAL_DEV=true` reads `latest-faucet-deployment.json`; on **any** read/JSON/schema failure it `console.warn`s and returns a hardcoded address. The faucet address feeds fund-moving drip logic, so a stale or unreadable deployment file silently drips against the wrong contract with only a warn line.

Fund-safety framing: none of these is a live remote fund-loss path today (the Anvil-key var is dead, the faucet fallback is local-dev/misconfig). The fund-safety relevance is that all three sit on the path that produces signed transactions and faucet drips, and each one trades a loud boot-time failure for a silent-wrong or opaque-late failure on exactly that path. This is fail-fast / sibling-consistency hardening at the config boundary, not a speculative or refuse-to-sign change.

## Findings

- **F296** (low, info) — `packages/demo/backend/src/config/env.ts:50-67`: `SESSION_SIGNER_PK` (`:60`), `FAUCET_ADMIN_PRIVATE_KEY` (`:50-53`), `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY` (`:66`), `OP_SEPOLIA_FAUCET_ADDRESS` (`:67`), and `AUTH_MODULE_ADDRESS` (`:61-63`) are typed as bare `str()` with no hex/length/`isAddress` validation; only `FAUCET_ADDRESS` (`:54-56`) goes through a real validator. A malformed key/address passes startup and fails deep inside viem as an opaque 500 instead of at boot.
- **F273** (medium, malicious-sign) — `packages/demo/backend/src/config/env.ts:50-53`: `FAUCET_ADMIN_PRIVATE_KEY` hard-defaults via `default` (production-applicable, unlike sibling `devDefault` secrets) to the well-known Anvil account-0 key `0xac0974...`, and the same key is committed in `.env.example:12`. Currently dead/unused (the active faucet signer is `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY`), so a latent foot-gun: a known key in the admin-key slot that a prod deploy resolves silently when unset.
- **F295** (low, correctness) — `packages/demo/backend/src/config/env.ts:18-56`: `getFaucetAddressDefault()` re-parses `LOCAL_DEV` via envalid's private `bool()._parse(process.env.LOCAL_DEV || 'false')` (`:20`) during default evaluation, duplicating validation and coupling to an internal API; and when `LOCAL_DEV=true`, on any deployment-file read/JSON failure it `console.warn`s and silently returns the hardcoded `0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8` (`:34-40`), so a stale/missing file drips against the wrong contract.

## Root cause

`cleanEnv` is the layer where format validation and fail-fast belong, and the schema only uses it for one of its many signing-critical inputs. `FAUCET_ADDRESS` is validated (`isAddress` + `getAddress` via `FaucetConfigSchema`) while every private key and every other address is a bare `str()` — a sibling-validation asymmetry inside one file. Separately, two values were given convenience defaults that work for local Anvil but are wrong for any other environment: `FAUCET_ADMIN_PRIVATE_KEY` got a hard `default` to the Anvil key (instead of `devDefault` or a required `str()` like its siblings), and the faucet-address resolver was written to "just work" by swallowing file errors into a hardcoded constant instead of failing where the file is expected. All three are missing-obvious-validation / fail-closed-where-the-backend-already-knows: the backend already validates one address the right way, already distinguishes `default` vs `devDefault` elsewhere, and already reads the deployment file — it just does not apply those patterns consistently to the signing-critical inputs.

## Recommended approach

This is the demo backend, so this ticket is **review-only**: low-risk fund-safety/config hardening, no architectural refactor of the env layer or the faucet flow. All three fixes stay inside `env.ts` and reuse the validation pattern the file already has for `FAUCET_ADDRESS`.

1. **Format-validate signing-critical secrets/addresses at boot (F296).** Add envalid custom validators so `cleanEnv` rejects malformed values at startup instead of letting viem fail late:
   - Private-key vars (`SESSION_SIGNER_PK`, `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY`, and `FAUCET_ADMIN_PRIVATE_KEY` if it is kept per step 2): require `^0x[0-9a-fA-F]{64}$`.
   - Address vars (`AUTH_MODULE_ADDRESS`, `OP_SEPOLIA_FAUCET_ADDRESS`): require `isAddress` (reuse the `FaucetConfigSchema` / `getAddress` pattern already in the file).
   - Do **not** log the values on failure — surface only "invalid `<VAR_NAME>` format" so a malformed key never lands in stderr or a log line.
   - Keep the existing `devDefault: 'dummy'` placeholders working in dev/test by validating only when a real value is provided (or by giving the dev placeholders a format-valid dummy), so this does not break local startup or `app.spec.ts`.

2. **Drop the known Anvil-key default (F273).** `FAUCET_ADMIN_PRIVATE_KEY` has zero runtime consumers (the active signer is `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY`). Preferred fix: **delete the declaration** entirely and remove the committed key from `.env.example:12`. If the var must stay, change `default` to a required `str()` (or `devDefault`) so production startup fails loudly when it is unset, matching `SESSION_SIGNER_PK` and the other secrets, and blank it in `.env.example`. Either way, never ship a known-compromised key as a value that can resolve in a non-dev environment. Update `app.spec.ts:10` to match whichever choice is taken.

3. **Fail loud (or read once) in the faucet-address default (F295).** Read `LOCAL_DEV` through `cleanEnv` / the public envalid API rather than the private `bool()._parse`, so it is validated once in the single pass. For the deployment-file fallback under `LOCAL_DEV=true`, fail loud when the file is expected but unreadable (throw, or log at error level and rethrow) instead of `console.warn`-ing and silently returning the hardcoded address, so a stale/missing deployment file cannot silently retarget faucet drips. The non-local-dev path keeping a fixed default is fine; the silent local-dev fallback is the foot-gun to remove.

This stays inside the missing-obvious-validation / fail-fast / sibling-consistency scope. No intent-guessing, no broad refuse-to-sign, and no RPC-trust hardening (integrators bring their own RPC; that is a documented assumption). The work is to apply the validation pattern the file already uses for `FAUCET_ADDRESS` to the rest of the signing-critical inputs, and to remove two defaults that resolve silently to the wrong value.

## Affected files

- `packages/demo/backend/src/config/env.ts:50-53` — `FAUCET_ADMIN_PRIVATE_KEY` Anvil-key `default` to drop (F273)
- `packages/demo/backend/src/config/env.ts:54-56` — `FAUCET_ADDRESS` validated-sibling pattern to reuse (F296 reference)
- `packages/demo/backend/src/config/env.ts:60` — `SESSION_SIGNER_PK` bare `str()`, no format check (F296)
- `packages/demo/backend/src/config/env.ts:61-63` — `AUTH_MODULE_ADDRESS` bare `str()`, no `isAddress` (F296)
- `packages/demo/backend/src/config/env.ts:66` — `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY` bare `str()`, no hex check (F296)
- `packages/demo/backend/src/config/env.ts:67` — `OP_SEPOLIA_FAUCET_ADDRESS` bare `str()`, no `isAddress` (F296)
- `packages/demo/backend/src/config/env.ts:18-41` — `getFaucetAddressDefault` private `_parse` + silent fallback (F295)
- `packages/demo/backend/src/config/env.ts:9-16` — `FaucetConfigSchema` (`isAddress`/`getAddress`) pattern to reuse for the address validators (F296)
- `packages/demo/backend/.env.example:12` — committed Anvil key to remove/blank (F273)
- `packages/demo/backend/src/app.spec.ts:10` — `FAUCET_ADMIN_PRIVATE_KEY` test value to update when F273 lands

## Acceptance criteria / tests

Each test must fail when the guard is reverted to current behavior (encode why the behavior matters, not just that it runs).

- Boot with `SESSION_SIGNER_PK=notakey` (or any non-`0x`-64-hex value) throws a `cleanEnv` config error at startup naming the variable, not at signing time; a well-formed `0x`-prefixed 64-hex key boots cleanly.
- Boot with a malformed `AUTH_MODULE_ADDRESS` / `OP_SEPOLIA_FAUCET_ADDRESS` (non-address string) throws at boot; a valid checksummed address boots cleanly. (Mirror the existing `FAUCET_ADDRESS` validation behavior.)
- The startup error for a malformed secret does **not** contain the offending value (assert the var name is present and the raw value is absent), so a bad key cannot leak into logs.
- `FAUCET_ADMIN_PRIVATE_KEY` no longer resolves to the Anvil key: if deleted, `env.FAUCET_ADMIN_PRIVATE_KEY` is gone and no code references it; if kept, an unset value fails boot (no silent Anvil-key resolution). `.env.example:12` no longer carries the concrete key.
- With `LOCAL_DEV=true` and a missing/corrupt `latest-faucet-deployment.json`, env resolution fails loud (throws / error-level + rethrow) instead of `console.warn`-ing and returning the hardcoded address; a valid deployment file still resolves to the deployed address.
- `LOCAL_DEV` is parsed only through `cleanEnv` / the public envalid API (no `._parse` reference remains in `env.ts`).

Existing `app.spec.ts` env wiring must still pass with the dev placeholders (keep `devDefault` values format-valid or scoped so local/test startup is unaffected).

## Notes

- F296 relates to F273: both touch the same secrets in the same file, but F273 is the bad default *value* (the Anvil key) and F296 is the missing *format validation* across all signing-critical secrets. They are bundled here because the F296 fix (format validators) and the F273 fix (drop the default) land in the same `env.ts` lines and should be reasoned about together.
- The redactor-side concern (F328, CLI `parseSigner` echoing a malformed key into error output) is a distinct surface and mechanism; it is noted in the ledger as relating to F296 but is tracked separately and is not part of this backend ticket. The "do not log the value" criterion above is the backend-side analog kept local to `env.ts`.
- `FAUCET_ADMIN_PRIVATE_KEY` being dead today is what keeps F273 at a latent-foot-gun framing rather than live exposure; the medium severity reflects the production-applicable `default` (vs `devDefault`) and the committed known key teaching the wrong convention, per the consolidated severity note in review-pass-12.
- This is a demo-backend ticket: review-only, low-risk config hardening. No restructuring of the env layer, the faucet service, or the deployment-file flow is requested — only the three localized validations/removals above.
