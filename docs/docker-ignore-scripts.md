# Docker Node install scripts policy

Dependency installs in `Dockerfile` use `--ignore-scripts` by default (see `.npmrc`).

## Allowlist

| Package | Reason | Dockerfile step |
|---------|--------|-----------------|
| `resolve-tspaths` | `prepare` builds `dist/main.js`; skipped by `--ignore-scripts` | `RUN pnpm --config.ignore-scripts=false rebuild resolve-tspaths`; package `build` scripts invoke `node …/resolve-tspaths/dist/main.js` |
