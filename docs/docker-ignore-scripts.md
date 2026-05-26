# Docker Node install scripts policy

Dependency installs in `Dockerfile` use `--ignore-scripts` on the install line (repo `.npmrc` is gitignored; use the same flag locally if desired).

## Allowlist

| Package | Reason | Dockerfile step |
|---------|--------|-----------------|
| `resolve-tspaths` | Published bin shim breaks under `--ignore-scripts` in Docker | `RUN pnpm --config.ignore-scripts=false rebuild resolve-tspaths`; `@eth-optimism/actions-sdk` build uses `node …/resolve-tspaths/dist/main.js` |
