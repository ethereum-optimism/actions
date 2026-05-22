// Populate env vars before module load so `cleanEnv()` in src/config/env.ts
// doesn't exit when CI runs specs that import @/app.js. Locally-set values win.
const TEST_ENV_DEFAULTS = {
  // Safe to check in: well-known Anvil dev key, only satisfies cleanEnv at import.
  SESSION_SIGNER_PK:
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
} as const

for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
  if (!process.env[key]) {
    process.env[key] = value
  }
}
