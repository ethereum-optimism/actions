# Rename Hosted → Embedded Wallet Provider

**Issue:** #330  
**Type:** Breaking change refactoring  
**Scope:** ~344 occurrences across ~55 files

## Approach

**Strategy:** Automated find-and-replace with manual verification, organized in logical commit chunks.

**Order of operations:**
1. Rename directories (folder structure changes first)
2. Rename files (maintains git history better)
3. Update class/type/interface names in code
4. Update string literals and comments
5. Update public API surface
6. Update tests
7. Update documentation

## Rename Mapping

| Old | New |
|-----|-----|
| `hosted` | `embedded` |
| `Hosted` | `Embedded` |
| `HOSTED` | `EMBEDDED` |

**Specific patterns:**
- `HostedWalletProvider` → `EmbeddedWalletProvider`
- `HostedProviderFactory` → `EmbeddedProviderFactory`
- `HostedProviderDeps` → `EmbeddedProviderDeps`
- `HostedWalletProviderRegistry` → `EmbeddedWalletProviderRegistry`
- `hostedWalletProvider` → `embeddedWalletProvider`
- `hostedWalletConfig` → `embeddedWalletConfig`
- `wallet/*/providers/hosted/` → `wallet/*/providers/embedded/`

## Tasks

- [ ] Find all occurrences: `rg -i "hosted" packages/sdk/src/`
- [ ] Rename directories: `packages/sdk/src/wallet/*/providers/hosted/` → `.../embedded/`
- [ ] Rename TypeScript files containing "hosted"
- [ ] Update imports across codebase
- [ ] Update class/interface/type declarations
- [ ] Update variable names and string literals
- [ ] Update comments and JSDoc
- [ ] Update test files
- [ ] Run build: `pnpm build`
- [ ] Run lint: `pnpm lint:fix`
- [ ] Run tests: `pnpm test`
- [ ] Update README/docs if they reference "hosted"

## Commit Strategy

Small, logical commits:
1. "Rename hosted → embedded directories"
2. "Rename hosted → embedded files"
3. "Update hosted → embedded types and classes"
4. "Update hosted → embedded in tests"
5. "Update hosted → embedded in docs"

## Deprecation Note

Issue suggests considering a deprecation alias for one release cycle. This refactor will NOT include that - it's a clean breaking change. If deprecation is needed, it should be a separate follow-up PR.

## Verification

Before opening PR:
- ✅ Build passes
- ✅ Lint passes
- ✅ Tests pass
- ✅ No remaining "hosted" references in SDK code (verify with ripgrep)
- ✅ Public API surface updated correctly
