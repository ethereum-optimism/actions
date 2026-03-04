---
title: "feat: Ephemeral backend previews via Netlify Functions"
type: feat
status: active
date: 2026-03-03
origin: docs/brainstorms/2026-03-03-ephemeral-backend-previews-brainstorm.md
---

# Ephemeral Backend Previews via Netlify Functions

## Overview

When a PR is opened, Netlify auto-deploys a frontend preview but the backend stays on GCP — so new endpoints aren't testable. This plan wraps the existing Hono backend as a Netlify Function v2 so every deploy preview gets a matching backend at the same URL. Production is completely untouched.

## Problem Statement

Reviewers can't test new API endpoints in Netlify deploy previews because no ephemeral backend exists. They must either run the backend locally or wait for a merge to main. This slows down review cycles.

## Proposed Solution

Deploy the Hono backend as a Netlify Function alongside the frontend. Netlify Functions v2 uses standard Web API `Request`/`Response` — exactly what Hono is built on — so no special adapter package is needed. The function entry point calls `app.fetch(request)` directly.

(see brainstorm: `docs/brainstorms/2026-03-03-ephemeral-backend-previews-brainstorm.md`)

## Technical Approach

### Architecture

```
                    Netlify Deploy Preview
                    ┌─────────────────────────────────┐
                    │                                  │
  Browser ──GET /── │ → Vite static files (frontend)   │
                    │                                  │
  Browser ──GET /api/wallet── │ → Rewrite (status 200) │
                    │   → /.netlify/functions/api      │
                    │   → Hono app.fetch(request)      │
                    │                                  │
                    └─────────────────────────────────┘
```

**Key insight**: No `@hono/netlify` adapter package needed. Netlify Functions v2 handler signature is:
```typescript
export default async (request: Request, context: Context) => Response
```
Hono's `app.fetch()` already matches this — it takes a `Request` and returns a `Response`.

### Implementation Steps

#### Step 1: Extract Hono app into standalone factory function

**File**: `packages/demo/backend/src/app.ts`

Currently the Hono app is a local variable inside `ActionsApp.main()`, tightly coupled to the Node.js server. Extract it into a standalone `createApp()` function.

**Before** (current — lines 36-77):
```typescript
protected async main(): Promise<void> {
    const app = new Hono()
    app.use('*', cors({ ... }))
    app.use('*', actionsMiddleware)
    app.route('/', router)
    this.server = serve({ fetch: app.fetch, port: ... })
    // ...
}
```

**After**:
```typescript
// New exported function — packages/demo/backend/src/createApp.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { actionsMiddleware } from '@/middleware/actions.js'
import { router } from '@/router.js'

export function createApp(): Hono {
  const app = new Hono()

  app.use('*', cors({
    origin: (origin) => {
      if (origin.startsWith('http://localhost:')) return origin
      if (origin === 'https://actions-ui.netlify.app') return origin
      if (origin === 'https://actions.money') return origin
      if (origin === 'https://actions.optimism.io') return origin
      if (origin.match(/^https:\/\/deploy-preview-\d+--actions-ui\.netlify\.app$/)) {
        return origin
      }
      return null
    },
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'privy-id-token'],
  }))

  app.use('*', actionsMiddleware)
  app.route('/', router)

  return app
}
```

Then `ActionsApp.main()` becomes:
```typescript
protected async main(): Promise<void> {
    const app = createApp()
    this.server = serve({ fetch: app.fetch, port: Number(this.options.port) })
    // ...
}
```

**Why a separate file**: Keeps `app.ts` focused on the CLI/server lifecycle. The `createApp()` function has no Node.js server dependencies and can be imported by both the Node.js server and the Netlify Function.

#### Step 2: Create Netlify Function entry point

**File**: `netlify/functions/api.ts`

```typescript
import { initializeActions } from '../../packages/demo/backend/src/config/actions.js'
import { createApp } from '../../packages/demo/backend/src/createApp.js'

// Initialize Actions SDK once on cold start
initializeActions()

const app = createApp()

export default async (request: Request) => {
  // Strip /api prefix — the rewrite sends /api/wallet here,
  // but the Hono routes expect /wallet
  const url = new URL(request.url)
  const strippedPath = url.pathname.replace(/^\/api/, '') || '/'
  const newUrl = new URL(strippedPath + url.search, url.origin)
  const newRequest = new Request(newUrl.toString(), request)

  return app.fetch(newRequest)
}
```

**Note on imports**: These are relative paths from the repo root. Netlify's bundler (esbuild) will follow them and bundle the backend code into the function. Since this is a monorepo, the function file lives at the repo root level (not inside a package).

**Note on initialization**: `initializeActions()` runs at module scope (cold start). The `env.ts` module validates environment variables on import via `envalid`. All required env vars must be set in Netlify's dashboard.

**Note on path stripping**: The Netlify rewrite sends `/api/wallet` to this function, but Hono routes are defined as `/wallet`, `/lend/markets`, etc. We strip the `/api` prefix before passing to Hono.

#### Step 3: Update `netlify.toml`

**File**: `netlify.toml`

```toml
[build]
  command = "pnpm --filter @eth-optimism/actions-sdk build && pnpm --filter @eth-optimism/actions-service build && pnpm --filter actions-ui build"
  publish = "packages/demo/frontend/dist"

[build.environment]
  NODE_VERSION = "20"
  NODE_OPTIONS = "--max-old-space-size=8192"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

# Rewrite /api/* to the backend function (status 200 = rewrite, not redirect)
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api"
  status = 200
```

Changes:
1. **Build command**: Added `pnpm --filter @eth-optimism/actions-service build` between SDK and frontend builds. The backend must be compiled (tsc + resolve-tspaths) before the function can import it.
2. **`[functions]` block**: Points to `netlify/functions/` directory, uses esbuild bundler.
3. **`[[redirects]]` rewrite**: Routes `/api/*` to the function. `status = 200` makes it a rewrite (not a redirect), so the browser URL stays the same.

#### Step 4: Fix frontend `VITE_ACTIONS_API_URL` validation

**File**: `packages/demo/frontend/src/envVars.ts` (line 4-12)

The current Zod validator uses `.url()` which rejects relative paths like `/api`. Change to `.string()`:

```typescript
VITE_ACTIONS_API_URL: z
  .string()
  .default(
    import.meta.env.MODE === 'production'
      ? 'https://dev-verbs-service.optimism.io'
      : 'http://localhost:3000',
  )
  .describe('Base URL for the actions service API'),
```

The API client at `packages/demo/frontend/src/api/actionsApi.ts` constructs URLs as `${this.baseUrl}${endpoint}`. With `VITE_ACTIONS_API_URL=/api`, calls become `/api/wallet`, `/api/lend/markets`, etc. — relative to the current origin. This is exactly what we want for deploy previews.

#### Step 5: Set Netlify environment variables

In the Netlify dashboard, add these env vars scoped to **Deploy Preview** context:

| Variable | Value | Notes |
|----------|-------|-------|
| `VITE_ACTIONS_API_URL` | `/api` | Frontend points to same-origin function |
| `SESSION_SIGNER_PK` | (testnet key) | **Required** — no default |
| `PRIVY_APP_ID` | (testnet value) | `devDefault` won't apply since Netlify sets `NODE_ENV=production` |
| `PRIVY_APP_SECRET` | (testnet value) | Same as above |
| `BASE_SEPOLIA_BUNDLER_URL` | (testnet URL) | Same as above |
| `UNICHAIN_BUNDLER_URL` | (testnet URL) | Same as above |
| `UNICHAIN_BUNDLER_SPONSORSHIP_POLICY` | (testnet value) | Same as above |
| `AUTH_MODULE_ADDRESS` | (testnet address) | Same as above |
| `OP_SEPOLIA_BUNDLER_URL` | (testnet URL) | Same as above |
| `FAUCET_AUTH_MODULE_ADMIN_PRIVATE_KEY` | (testnet key) | Same as above |
| `OP_SEPOLIA_FAUCET_ADDRESS` | (testnet address) | Same as above |

**Important**: `envalid`'s `devDefault` only applies when `NODE_ENV !== 'production'`. Netlify sets `NODE_ENV=production` for all deploys including previews. All variables with `devDefault` need real values.

#### Step 6: Handle `/version` endpoint

**File**: `packages/demo/backend/src/router.ts` (lines 16-40)

The `/version` endpoint uses `readFileSync` with a path relative to the compiled JS file (`../package.json`). In a Netlify Function bundle, this path won't exist. Two options:

**Option A (recommended)**: Hardcode version info at build time. Add a simple constant:
```typescript
const VERSION_INFO = {
  name: '@eth-optimism/actions-service',
  version: '0.0.1',
  description: 'Hono service for actions SDK',
}

router.get('/version', (c) => c.json(VERSION_INFO))
```

**Option B**: Wrap in try/catch (already done — returns 500 with error message). The endpoint is non-critical, so failing gracefully is acceptable.

## Acceptance Criteria

- [ ] `createApp()` extracted into standalone function, importable without starting a server
- [ ] Netlify Function entry point at `netlify/functions/api.ts` wraps the Hono app
- [ ] `netlify.toml` builds the backend, configures functions directory, and has `/api/*` rewrite
- [ ] Frontend `envVars.ts` Zod validator accepts relative paths (`.string()` instead of `.url()`)
- [ ] Deploy preview frontend calls `/api/*` which routes to the Netlify Function
- [ ] Health check: `GET /api/` returns `OK` on deploy preview
- [ ] Existing Node.js server startup (`pnpm dev` / `pnpm start`) still works unchanged
- [ ] Production Netlify deploy is unaffected (no `VITE_ACTIONS_API_URL` override for production context)

## Technical Considerations

**Bundle size**: Netlify Functions have a 50MB limit. The backend's deps (viem, ethers, morpho, aave SDK) are heavy. If the bundle exceeds 50MB, options include:
- Tree-shaking unused exports (esbuild should handle this)
- Excluding dev dependencies
- Using `external_node_modules` in Netlify config to exclude specific packages

**Cold starts**: ~1-3s for Node.js functions. Acceptable for PR review usage.

**Execution timeout**: 60 seconds (Netlify default). Blockchain operations on testnet should complete within this.

**CORS**: When running as a Netlify Function at the same origin as the frontend, `/api/*` requests are same-origin — CORS headers are unnecessary but harmless. The existing CORS config works fine.

**`envalid` + `NODE_ENV`**: Netlify sets `NODE_ENV=production` for all deploys. Variables with `devDefault` (not `default`) will be required in the Netlify dashboard. This is the biggest operational gotcha — missing a variable will crash the function on cold start with a clear `envalid` error.

**Path aliases**: The backend uses TypeScript path aliases (`@/config/actions.js` etc.) resolved by `resolve-tspaths` at build time. The Netlify Function imports the compiled output (`dist/`), where aliases are already resolved to relative paths. This should work transparently.

## Dependencies & Risks

- **Low risk**: Refactoring `createApp()` is a straightforward extraction — no behavior change.
- **Medium risk**: Netlify esbuild bundling in a pnpm monorepo may have workspace resolution issues. Test early.
- **Operational**: Secrets must be added to Netlify dashboard manually. If a variable is missing, the function will crash on first request with a clear error.
- **No production risk**: Production deploy uses `VITE_ACTIONS_API_URL=https://dev-verbs-service.optimism.io` (default). The function exists in production but is unused since no requests hit `/api/*`.

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-03-ephemeral-backend-previews-brainstorm.md](docs/brainstorms/2026-03-03-ephemeral-backend-previews-brainstorm.md) — Key decisions: Netlify Functions (Node.js), `/api/*` route pattern, deploy-preview only scope.
- **Backend entry point**: `packages/demo/backend/src/app.ts` — `ActionsApp` class with tightly-coupled Hono app
- **Backend routes**: `packages/demo/backend/src/router.ts` — All API endpoints
- **Backend env validation**: `packages/demo/backend/src/config/env.ts` — `envalid` with `devDefault` values
- **Frontend env config**: `packages/demo/frontend/src/envVars.ts` — Zod `.url()` validator to relax
- **Netlify Functions v2 API**: Uses standard `Request`/`Response` — no adapter needed
- **Hono AWS Lambda adapter**: `hono/aws-lambda` exists but isn't needed since Netlify v2 is Web Standards-based
