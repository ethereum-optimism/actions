# Bound ENS caches and forward-confirm resolved names/records

> **AUGMENT existing issue #453 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | core |
| **Surface** | `EnsNamespace` address/name/info caches (no eviction/cap), `getAddress`/`getName` resolution correctness, `getInfo` text-record sanitization, `getMainnetClient` cloudflare fallback, Morpho GraphQL fetch timeout |
| **Resolves findings** | F068, F270, F113, F096, F100 |
| **Candidate existing issue** | #453 |
| **Blocked by** | (none) |

## Problem

`EnsNamespace` is the SDK's name-resolution boundary: it turns user-typed ENS names into the checksummed address that gets baked into signed swap/transfer calldata (`actions/swap/module.ts:23` wires `ens.getAddress` behind recipient resolution), and it hands integrators reverse names and profile text records to render in recipient-confirmation UIs. Three correctness/safety gaps and one resource gap all live on this one boundary, and one more (Morpho fetch) is the sibling external-fetch-with-no-timeout footgun on the lend path.

The caches grow without bound. `addressCache`, `nameCache`, and `infoCache` insert one entry per distinct input and only *skip* expired entries on read — they never `delete`, `clear`, evict, or cap. A long-lived integrator server process holding one `Actions` instance and resolving attacker-influenceable inputs (user-submitted recipient names, arbitrary addresses) accumulates one permanent map entry per distinct input for the lifetime of the process: an unbounded per-process memory-exhaustion / DoS vector.

Reverse resolution is returned unverified. `getName(address)` returns the raw self-set ENS reverse record with no forward-confirmation that the named record resolves back to the input address. ENS reverse records are unauthenticated: any address can set its primary name to `trusted.eth`. An integrator labeling a swap/transfer recipient with `getName(recipient)` shows the signer a spoofed trusted-looking name. The SDK does not consume `getName` in any value-movement decision today (forward resolution feeds recipients), so this is the integrator-facing leg, but the SDK is the boundary that hands back the unverified label.

Profile records are returned verbatim. `getInfo` returns ENSIP-5/18 text records (`avatar`, `url`, `email`, …) exactly as the resolver owner set them. An integrator that renders `info.avatar` into `<img src>` or `info.url` into `<a href>`/`fetch` inherits a stored-XSS (`javascript:`/`data:`) or SSRF/credential-leak vector seeded entirely from a name the end user typed.

Resolution silently falls back to a hardcoded third-party RPC. When mainnet (chain 1) is absent from the integrator's config, `getMainnetClient()` silently builds a client pointed at `https://cloudflare-eth.com` — so the address that gets signed into swap calldata is resolved through an endpoint the integrator never opted into. Per the standing RPC-trust rule this is a disclosure/opt-in gap adjacent to RPC trust, not an RPC-trust fix, but the silent hardcoded fallback for a value-bearing resolution is worth closing.

The Morpho rewards fetch can hang the open/close flow. `fetchRewards` issues a raw `fetch` to `api.morpho.org` with no timeout/AbortController; `getVault` awaits it before building the open/close signing transaction, so a reachable-but-never-responding endpoint stalls the entire flow with no upper bound.

## Findings

- **F270** (low, infra) — `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:52-60,78-113,126-183`: `addressCache`/`nameCache`/`infoCache` insert one entry per call (`:82-85`, `:108-111`, `:181`) with an `expiresAt`; reads only skip when `Date.now() >= expiresAt` (`:80,:97,:131`) and stale entries are never deleted — no `delete`/`clear`/LRU/size cap exists in the file. A long-lived instance on attacker-influenceable inputs grows the maps unbounded until OOM.
- **F068** (low, info) — `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:95-113`: `getName(address)` returns the raw `getEnsName` reverse record with no forward-confirmation that the returned name resolves back to the input address; ENS reverse records are self-set and unauthenticated, so the returned primary name is attacker-settable and unsafe as a trusted recipient label.
- **F113** (low, info) — `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:155-183`: `getInfo` returns resolver-owner-controlled text records (`url`/`avatar`/`email`/etc.) verbatim with no scheme allowlisting, normalization, or documented "untrusted, sanitize before rendering" warning — a stored-XSS/SSRF seed for an integrator that renders/fetches the values.
- **F096** (low, info) — `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:19-20,185-194`: `getMainnetClient()` silently falls back to a hardcoded `createPublicClient` on `FALLBACK_MAINNET_RPC = 'https://cloudflare-eth.com'` when chain 1 is unconfigured; the resolved address flows into signed swap calldata (`actions/swap/module.ts:23`), so a recipient is silently resolved through a third-party endpoint the integrator never opted into.
- **F100** (low, info) — `packages/sdk/src/actions/lend/providers/morpho/api.ts:73-89`: `fetchRewards` calls `await fetch(MORPHO_API_ENDPOINT, …)` (`:74`) with no `signal`/timeout; `getVault` awaits it inside `MorphoLendProvider._openPosition`/`_closePosition` before building the signing tx, so a reachable-but-hung Morpho API stalls open/close indefinitely (the `catch` only handles rejections, not a hang).

Related context (not resolved here, tracked under #453): the ledger also carries `refines:F068` (`EnsNamespace.ts:78-87`, medium, malicious-sign) — `getAddress` caches the ENS→address resolution for 5 minutes with no invalidation/round-trip, so a stale/changed forward record yields a wrong *signed* recipient. That cache-staleness-on-the-signing-path leg is the higher-severity sibling of the bounding work below; see Notes.

## Root cause

All four ENS gaps share one root: `EnsNamespace` treats every value it touches — cache entries, reverse names, text records, and the resolution transport — as trusted and permanent when each is in fact untrusted, mutable, or unbounded. The caches were written as read-side TTL checks with no write-side lifecycle (no eviction path was ever added), so "cached" silently means "retained forever." `getName` and `getInfo` were written as thin pass-throughs over viem's `getEnsName`/`getEnsText` with no acknowledgment that ENS reverse and text records are owner-controlled and unauthenticated. The cloudflare fallback was added for L2-only-config convenience and chooses a named third-party endpoint silently rather than making the integrator opt in. The Morpho fetch is the same shape on a different surface: an external HTTP dependency invoked on a signing-adjacent path with no timeout, where a sibling on-chain read would inherit the integrator's viem-client timeout but this raw `fetch` does not.

## Recommended approach

All changes are within the SDK (SDK refactor allowed). This stays inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope: bound a cache that already tracks `expiresAt`, sanitize/confirm data the SDK already knows is untrusted, and add a timeout to a fetch whose sibling reads already have one. No speculative intent-guessing and no broad refuse-to-sign.

1. **Bound the three caches (F270).** Delete the stale key inside each getter when the cached entry is found-but-expired (so a re-fetch replaces rather than accumulates), and add a max-entries cap with LRU/FIFO eviction on each Map (or a single shared bounded-cache helper used by all three). Make the cap configurable alongside the existing `cacheTtlMs` constructor arg. The simplest correct version — evict-on-expired-read plus a fixed per-map cap — closes the unbounded-growth vector; do this first since it is pure resource hardening with no behavioral change to resolution results.

2. **Forward-confirm `getName` (F068).** Document in the `getName` JSDoc that the returned name is unverified self-set reverse data and must not be shown as a trusted recipient label without forward-confirmation. Add an opt-in forward-confirmed result (resolve the returned name back to an address and `isAddressEqual` to the input; return `null` or a `verified: false` flag on mismatch) so integrators have a safe path without re-implementing the round-trip. Keep the raw `getName` for callers that explicitly want the unverified record, but the docs must name the spoof.

3. **Sanitize / document `getInfo` (F113).** Document in the `getInfo` JSDoc that every returned field is untrusted resolver-controlled text that must be sanitized/scheme-checked before rendering or fetching. Optionally normalize `avatar`/`url` at the SDK boundary to reject non-`http(s)` schemes (drop `javascript:`/`data:`/internal-host URLs to `null`). No behavioral change is strictly required if the trust level is documented, but boundary scheme-checking is the lower-risk default since the SDK is the layer introducing the external data.

4. **Surface the cloudflare fallback (F096).** Document that ENS resolution falls back to `cloudflare-eth.com` when mainnet is unconfigured. Prefer making it opt-in: when chain 1 is absent, throw `EnsNotConfiguredError` (the error the lower-level `resolveAddress` already throws when no client is supplied) rather than silently constructing the hardcoded-RPC client, OR require the integrator to explicitly acknowledge the public fallback via config. This is info-only under the RPC-trust rule, but the fail-closed "require explicit mainnet config" variant is the consistent default because the resolved address is signed.

5. **Add a timeout to the Morpho fetch (F100).** Pass `AbortSignal.timeout(<n>ms)` (or an AbortController + setTimeout) to the `fetch` in `fetchRewards` so a stalled Morpho API degrades to the existing null/empty-rewards fallback (the `catch` already returns `null`) instead of hanging open/close. Pick a timeout consistent with any timeout the integrator's viem client uses for sibling on-chain reads.

## Affected files

- `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:52-60` — three unbounded `Map` cache declarations (F270)
- `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:78-87` — `getAddress` cache insert with no eviction (F270); cache-staleness-on-signing-path is `refines:F068`, see Notes
- `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:95-113` — `getName` unverified reverse record + cache insert (F068, F270)
- `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:126-183` — `getInfo` verbatim text records + cache insert (F113, F270)
- `packages/sdk/src/services/nameservices/ens/EnsNamespace.ts:19-20,185-194` — `FALLBACK_MAINNET_RPC` constant and `getMainnetClient` cloudflare fallback (F096)
- `packages/sdk/src/services/nameservices/ens/utils.ts:43-52` — `resolveAddress` already throws `EnsNotConfiguredError` when no client is supplied (F096 reference for the fail-closed variant)
- `packages/sdk/src/actions/swap/module.ts:23` — swap recipient resolution wired behind `ens.getAddress` (F096 signing-path consumer)
- `packages/sdk/src/actions/lend/providers/morpho/api.ts:73-89` — `fetchRewards` raw `fetch` with no timeout/AbortSignal (F100)

## Acceptance criteria / tests

Each test must fail when the guard is reverted to current behavior (encode why the behavior matters, not just that it runs).

- **Cache bounding (F270):** resolving N distinct inputs past the configured max-entries cap leaves each Map at the cap, not at N (asserts eviction happens, not just TTL skip). A found-but-expired cache hit deletes the stale key before re-fetching (asserts no stale-entry accumulation). The cap is configurable via the constructor.
- **Forward-confirm `getName` (F068):** with a mocked reverse record of `trusted.eth` whose forward resolution does NOT round-trip to the input address, the forward-confirmed result is `null`/`verified: false` (asserts the reverse-spoof is caught); a record that does round-trip is returned as verified.
- **`getInfo` sanitization (F113):** if scheme-checking is implemented, a text record of `javascript:alert(1)` / `data:` / internal-host URL for `url`/`avatar` is normalized to `null`; an `https://` value passes through. If documentation-only, assert the JSDoc warning is present (lint/doc check). Either way the test names the untrusted-data contract.
- **Cloudflare fallback (F096):** with chain 1 absent from config, the chosen semantics holds — either `getAddress(ensName)` throws `EnsNotConfiguredError` (fail-closed variant) or the public-fallback path is exercised only when explicitly acknowledged (asserts the silent hardcoded-RPC path is gone or gated). With chain 1 configured, resolution uses the integrator client.
- **Morpho timeout (F100):** a `fetch` that accepts but never responds causes `fetchRewards` to settle (reject/return `null`) within the timeout rather than hanging, and `getVault`/open/close proceed with the empty-rewards fallback (asserts the open/close flow has an upper bound).

These getters and the Morpho fetch currently have thin coverage; add the eviction, round-trip, scheme-check, and timeout cases as unit tests on `EnsNamespace` and `morpho/api.ts` so the boundary guarantees cannot silently regress.

## Notes

- This augments **#453**. The whole ENS-namespace correctness/bounding family (F068, F270, F096, F113) carries candidate issue #453; F100 (#211) is the sibling external-fetch-timeout footgun pulled in here because it is the same "untrusted external dependency on a signing-adjacent path with no bound" shape and shares the fix pattern.
- The higher-severity sibling on this surface is the ledger `refines:F068` item (`EnsNamespace.ts:78-87`, medium, malicious-sign): `getAddress` caches the ENS→address resolution for 5 minutes with no invalidation or round-trip, and that resolved address is signed into recipient-bearing calldata (e.g. Velodrome v2/leaf bake the recipient into calldata). For recipient resolution that feeds signed calldata, the cache should be bypassed (resolve fresh) or the TTL drastically shortened/validated, with the resolution timestamp surfaced; this is the cache-correctness leg that the F270 bounding work should land alongside under #453, since both touch the same `getAddress` cache.
- F113 candidate issue was recorded as #371 and F100 as #211 in the per-pass reviews; both are folded under the #453 augmentation here for the consolidated ENS-boundary pass. If the issue triage prefers to keep F100 on #211, it can be split out — the fix (add `AbortSignal.timeout` to one `fetch`) is independent of the ENS work.
- F096 is info-only under the standing RPC-trust rule (integrators bring their own RPC; that is a documented assumption, not a ticket). It is included here only because the cloudflare endpoint is a specific named third-party the SDK *chooses* on the recipient-resolution path whose output is signed — the recommended fix is disclosure plus an opt-in/fail-closed config gate, not RPC-trust hardening of integrator-supplied transports.
