---
date: 2026-03-03
topic: ephemeral-backend-previews
---

# Ephemeral Backend Previews via Netlify Functions

## What We're Building

PR preview deployments for the backend, so that when Netlify auto-deploys a frontend preview, a matching backend is available at the same URL. This lets reviewers test new API endpoints without waiting for a merge to main.

The backend (Hono/Node.js) will be wrapped as a Netlify Function using Hono's official Netlify adapter. It deploys alongside the frontend in every deploy preview — no separate infrastructure, no Docker builds, no Kubernetes changes.

## Why This Approach

**Considered:**
1. **Netlify Functions (chosen)** — Zero new infrastructure. Backend deploys with frontend automatically. Same preview URL serves both. Teardown is automatic.
2. **Separate PaaS (Railway/Render)** — Requires a new account, a second set of secrets, and coordination to wire the correct frontend preview to the correct backend preview. More moving parts.
3. **GCP Cloud Run per PR** — Would require Docker builds, GCP IAM, and a GitHub Action to create/destroy services. Touches production infra.

Netlify Functions wins on simplicity. The backend is stateless, the target is testnet, and cold starts are acceptable for PR reviews.

## Key Decisions

- **Netlify Functions (Node.js), not Edge Functions (Deno)**: The backend uses Node.js-specific packages (viem, ethers, @privy-io/node). Node.js Functions are the safe choice.
- **Route pattern `/api/*`**: Netlify rewrite rule forwards `/api/*` to the function. The Hono app strips the `/api` prefix.
- **Deploy-preview context only**: `VITE_ACTIONS_API_URL=/api` is set for deploy-preview context in Netlify. Production continues pointing to the GCP backend.
- **Secrets in Netlify env vars**: Testnet secrets (Privy, RPC URLs, bundler URLs, etc.) are added to Netlify's environment variables scoped to deploy-preview context.
- **Production untouched**: No changes to the GCP/K8s deployment, Docker pipeline, or production Netlify config beyond adding the function and rewrite rule.
- **Preview only scope**: This is not a replacement for the production backend — it exists solely to make PR previews functional.

## Implementation Sketch

1. Add `@hono/netlify` dependency to the backend package
2. Create a Netlify Function entry point (`netlify/functions/api.ts`) that imports the Hono app and wraps it with the adapter
3. Ensure the Hono app is cleanly importable without starting the Node.js server (may need minor refactor to separate app definition from server startup)
4. Update `netlify.toml`:
   - Add rewrite rule: `/api/*` → `/.netlify/functions/api`
   - Set `VITE_ACTIONS_API_URL=/api` for deploy-preview context
5. Add backend secrets to Netlify dashboard (deploy-preview context)
6. Verify bundle size stays under Netlify's 50MB function limit

## Known Constraints

- **Cold starts**: Netlify Functions have cold start latency (~1-3s). Acceptable for PR previews.
- **Bundle size**: 50MB limit. Backend has heavy deps (viem, ethers, morpho, aave). Likely fits but needs verification.
- **Execution timeout**: 10-26s depending on Netlify plan. Testnet blockchain ops should be fine.
- **No persistent state**: Backend is stateless so this is a non-issue.

## Open Questions

None — all questions resolved during brainstorm.

## Next Steps

→ `/workflows:plan` for implementation details
