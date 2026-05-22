// Sets minimum-viable env vars before any test module loads.
//
// `src/config/env.ts` runs `cleanEnv()` at import time and calls
// `process.exit(1)` when a non-`devDefault` var is missing. CI does not
// inject these, so any test that imports `@/app.js` (or transitively
// reaches `@/config/env.js`) crashes the entire spec file before tests
// can run. Vitest config wires this file via `setupFiles` so the env is
// populated before module evaluation starts.
//
// We do not overwrite values the developer already exported locally.
const TEST_ENV_DEFAULTS = {
  // Safe to check in. Anvil/Foundry's first well-known dev account key;
  // used only to satisfy `cleanEnv()` during test module load. The
  // tests that exercise auth-gated routes mock the Privy client, so
  // this key is never used to sign anything.
  SESSION_SIGNER_PK:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
} as const

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (!process.env[key]) {
    process.env[key] = value
  }
}
