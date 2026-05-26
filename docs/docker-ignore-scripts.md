# Docker Node install scripts policy

Dependency installs in `Dockerfile` use `--ignore-scripts` by default (see `.npmrc`).

## Allowlist

| Package | Reason | Dockerfile step |
|---------|--------|-----------------|
| `resolve-tspaths` | Published bin shim breaks under `--ignore-scripts` in Docker | `RUN pnpm --config.ignore-scripts=false rebuild resolve-tspaths`; `@eth-optimism/actions-sdk` build uses `node …/resolve-tspaths/dist/main.js` |
