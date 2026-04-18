# Brainstorm: EOA & Agent Wallet Support for Actions SDK

**Date:** 2026-04-01
**Branch:** kevin/eoa-support
**Status:** Brainstorm complete, ready for planning

---

## What We're Building

Enable the Actions SDK to support a local EOA signer that serves as the foundation for an agent-operated smart wallet system. The end-state is a flow where:

- A **user** connects their own wallet (MetaMask, Rabby, Turnkey) via a dashboard — the agent never has access to the user's key.
- An **agent** has its own local EOA key used solely for signing delegated operations.
- The user's **smart wallet** (ERC-4337) holds funds and is fully owned by the user.
- The agent receives **scoped, time-limited permissions** (ZeroDev session keys with on-chain policies) to act on the user's smart wallet.
- A **CLI** consumes the Actions SDK, allowing users or agents to run commands like `wallet swap quote 1 USDC OP`.

### Security Boundary

```
User (full owner)                    Agent (delegated access only)
     |                                        |
     v                                        v
  Browser Wallet ──owns──> Smart Wallet <──session key── Agent EOA
  (MetaMask/Rabby/        (ZeroDev Kernel)  (scoped via    (local key)
   Turnkey)                 holds funds      Call Policy +  signs UserOps
                                             Spending Cap)
                                             revocable
```

- The user's private key **never** touches the agent or SDK runtime.
- The agent's local key is converted to a viem `LocalAccount` immediately; the raw key string is never stored on any SDK object.
- New permissions: agent requests via dashboard UI, user reviews and signs on their own device.

---

## Why This Approach

### Local EOA as Foundation

The SDK already has an `EOAWallet` class and a `HostedWalletProvider` registry (Privy, Turnkey). Adding a `type: 'local'` provider fits the existing architecture with minimal changes:

- `LocalHostedWalletProvider` extends `HostedWalletProvider`
- `LocalWallet` extends `EOAWallet`
- Registered in `NodeHostedWalletProviderRegistry` alongside Privy and Turnkey
- Uses viem's `privateKeyToAccount()` — no external SDK dependencies

This unlocks both direct EOA usage (dev/testing) and smart wallet ownership (production), since the local EOA serves as the signer/owner for ERC-4337 smart wallets.

### Permission Model (ZeroDev Kernel Session Keys)

Rather than giving the agent direct access to funds, the user grants a scoped session key enforced on-chain:

- **Call Policy** (built-in): restricts which contracts, function selectors, and arguments the agent can call
- **Custom Cumulative Spending Cap Policy** (~250 lines Solidity, ZeroDev `PolicyBase`): tracks `approve()`, `transfer()`, `increaseAllowance()` + native ETH value across time windows. Four composable modes: USD cap via Chainlink, per-token cap, asset allowlist, unrestricted. Most restrictive rule wins.
- **Signature Allowlist**: blocks `permit()` attacks and other dangerous signature types via `checkSignaturePolicy`
- **Rate Limit / Timestamp Policies**: additional built-in ZeroDev policies for fine-grained control
- All policies enforced at ERC-4337 validation level — agent code cannot bypass them
- Revocable at any time by the user (owner) via dashboard

The agent signs UserOperations with its session key. A bundler submits the UserOps, and a paymaster can sponsor gas.

**Why ZeroDev Kernel, not Coinbase Smart Account:** Coinbase Smart Wallet is non-modular (no ERC-7579 support). It cannot install custom validators or policy plugins. Its Spend Permissions only control token transfer amounts — they cannot restrict which contracts or functions are called. CDP Policies are off-chain only. Coinbase explicitly abandoned session keys in favor of Sub Accounts. ZeroDev Kernel's ERC-7579 modular architecture supports exactly the on-chain permission enforcement we need. See prior research: `docs/` in `its-applekid/agent-actions`.

**Why not ERC-7710:** ERC-7710 (MetaMask Delegation Toolkit) is a viable alternative, but ZeroDev's session key system is more mature for our use case — it has built-in Call Policy, composable policy plugins, and the `PolicyBase` interface for custom spending caps. ZeroDev co-authored ERC-7715 (`wallet_grantPermissions`) which standardizes the permission-granting flow.

### Gas Bootstrapping

To reduce onboarding friction:
1. User signs up with USDC only (no ETH required)
2. Paymaster covers initial setup gas (smart wallet deployment, initial delegation)
3. Agent requests delegation to swap some USDC to ETH for gas
4. Once funded, agent pays its own gas going forward

---

## Key Decisions

1. **Provider type name:** `'local'` (not `'local-eoa'`)

2. **Config approach:** Private key passed via config object (`{ type: 'local', config: { privateKey } }`), same as Privy/Turnkey pattern. Caller sources the key (e.g., from `process.env`).

3. **Key security:** Immediate conversion to viem `LocalAccount` via `privateKeyToAccount()`. Raw key string is never stored on any class property. The `LocalAccount` can sign but doesn't expose the key.

4. **Agent key sourcing:** Support both auto-generated (fresh keypair at setup) and user-provided (env var). Auto-generate is default for CLI/agent use; provided key for server/programmatic use.

5. **Agent key storage:** Security is the top priority. The raw private key must never appear in plaintext on disk or in chat history.
   - **At rest:** Encrypted file in `~/.actions/` (e.g., `agent-key.enc`). Never plaintext.
   - **Decryption key:** Stored in OS-native secret management (macOS Keychain, Linux secret-tool, Windows Credential Manager) or 1Password / passkey on mobile.
   - **Access flow:** Agent reads encrypted keyfile -> retrieves decryption key from OS keychain / 1Password -> decrypts in memory -> `privateKeyToAccount()` -> signs -> raw key discarded.
   - **Onboarding:** Agent generates keypair, encrypts it, writes to `~/.actions/`, and guides user through storing the decryption key in their preferred secret manager.
   - **Never in chat:** The user should never have to type or paste the agent's private key into a conversation.

6. **No rename of `HostedWalletProvider`:** The "hosted" naming is imperfect for a local key, but a rename is out of scope. The local provider plugs into the existing system as-is.

7. **Smart wallet: ZeroDev Kernel** (replaces Coinbase Smart Account). Coinbase Smart Wallet is non-modular — cannot install custom validators, policy plugins, or enforce on-chain contract-call restrictions. ZeroDev Kernel's ERC-7579 architecture supports session keys, Call Policy, and custom `PolicyBase` spending caps. This is a separate work item (Issue 3) from the local EOA provider.

8. **User wallet isolation:** User connects via browser wallet or Turnkey through a dashboard. The agent SDK never has access to the user's signing key. Permission changes go through the dashboard UI.

9. **Protocol/chain scope:** Whatever the SDK supports — all configured chains and protocols (Uniswap, Velodrome, Morpho, Aave). The on-chain permission system (Call Policy, spending caps) scopes agent access, not artificial SDK-level restrictions. Note: smart accounts and policies must be deployed per chain (deterministic addresses via CREATE2, but separate deployment txs).

10. **CLI + Agent Skill distribution:** CLI package in monorepo (`packages/cli/`). Separate agent skill (SKILL.md) teaches AI agents how to use the CLI. No MCP server in v1 — the skill instructs the agent to invoke CLI commands directly.

---

## Work Chunks

Each chunk is a separate GitHub issue with its own PR and incremental commits. The implementing agent should create these issues.

### Issue 1: Add `type: 'local'` Provider to SDK

**Depends on:** None (existing EOA research issue should be closed when this ships)

- Create `LocalHostedWalletProvider` extending `HostedWalletProvider`
- Create `LocalWallet` extending `EOAWallet`
- Register `'local'` in `NodeHostedWalletProviderRegistry`
- Add `'local'` to `NodeProviderTypes` and `NodeOptionsMap`
- Implement `createSigner()` and `toActionsWallet()`
- Security: immediate `privateKeyToAccount()`, never store raw key
- Tests: provider creation, signer creation, wallet operations
- Verify existing `createActions()` works with `{ type: 'local', config: { privateKey } }`

### Issue 2: Key Generation & Secure Storage Utility

**Depends on:** Issue 1

- `generateAgentKey()` utility that creates a fresh keypair
- Returns `{ address, localAccount }` — no raw key in return type
- Encryption: encrypt private key before writing to `~/.actions/agent-key.enc`
- Decryption key storage: integrate with OS-native secret management (macOS Keychain, Linux secret-tool, Windows Credential Manager) and 1Password / passkey where available
- `loadAgentKey()` utility that reads encrypted keyfile, retrieves decryption key from secret manager, returns `LocalAccount`
- Onboarding helper: guides user through storing decryption key in their preferred secret manager
- Raw private key never written to disk in plaintext, never surfaced in chat
- **Headless/server fallback:** For CI or server environments without OS keychain, support reading the private key from an environment variable (falls back to the `type: 'local'` config approach). Document that this is less secure than the encrypted keyfile model.
- Could use viem's `generatePrivateKey()` + `privateKeyToAccount()`
- Tests: key generation, encryption/decryption round-trip, address derivation

### Issue 3: Migrate Smart Wallet from Coinbase to ZeroDev Kernel

**Depends on:** None (can be done in parallel with Issue 1)

- Replace `DefaultSmartWallet` (Coinbase Smart Account) with ZeroDev Kernel v3
- Implement `ZeroDevSmartWallet` extending `SmartWallet`
- Implement `ZeroDevSmartWalletProvider` extending `SmartWalletProvider`
- Maintain same public API surface (`createSmartWallet`, `getSmartWallet`, `addSigner`, `removeSigner`)
- ERC-7579 module installation support
- Multi-chain deployment support (ZeroDev supports this)
- Update `SmartWalletConfig` type to support ZeroDev-specific config (e.g., bundler URL, paymaster URL)
- Tests: smart wallet creation, signer management, UserOperation submission
- **Note:** This replaces `toCoinbaseSmartAccount()` with ZeroDev's Kernel account

### Issue 4: Agent Smart Wallet Setup

**Depends on:** Issues 1, 3

- Helper to create/retrieve a smart wallet from the agent's local key
- Uses new `ZeroDevSmartWalletProvider` and `createSmartWallet()`
- Multi-chain deployment support
- Tests: smart wallet creation with local signer, wallet retrieval

### Issue 5: On-Chain Permission Policies (Session Keys + Spending Caps)

**Depends on:** Issue 3

- **Session key creation:** User grants agent a scoped session key via ZeroDev's permission system (ERC-7715 `wallet_grantPermissions`)
- **Call Policy** (built-in ZeroDev): configure allowed contracts, function selectors, argument conditions, value limits per call
- **Custom Cumulative Spending Cap Policy** (~250 lines Solidity):
  - Extends ZeroDev `PolicyBase` interface
  - Tracks `approve()`, `transfer()`, `increaseAllowance()` + native ETH value
  - Decodes `executeBatch()` and checks each call
  - Four composable modes: USD cap (Chainlink oracle), per-token amount cap, asset allowlist, unrestricted
  - Configurable time windows (hourly, daily, weekly, custom)
  - Most restrictive rule wins when modes combined
  - Blocks infinite approvals (`type(uint256).max`)
- **Signature Allowlist**: `checkSignaturePolicy` hook blocks `permit()` and other dangerous signature types
- **Rate Limit / Timestamp Policies**: compose with above for additional controls
- Deploy and verify spending cap contract
- Tests: policy enforcement, cap tracking, time window resets, batch decoding, permit blocking
- **Fuzz testing** (Foundry/Echidna) before mainnet deployment

### Issue 6: DeFi Contract Registry

**Depends on:** Issue 5

- Curated catalog of approved `(chainId, contractAddress, functionSelector)` tuples
- Shipped as signed JSON in npm package
- Users opt in to protocols via dashboard
- Users can also add custom contract addresses
- Registry signature verification in bot and dashboard
- Off-chain registry check as defense-in-depth (fast rejection before on-chain validation)
- v1 scope: all SDK-supported protocols (Uniswap, Velodrome, Morpho, Aave) across configured chains

### Issue 7: Dashboard — Setup & Permission Management

**Depends on:** Issues 5, 6

- Web dashboard (self-hostable, GitHub Pages or similar)
- **Setup flow:**
  1. User installs agent skill (OpenClaw or similar)
  2. Agent generates keypair, gives user setup URL with agent's public key in query string
  3. User visits URL, connects wallet (MetaMask, Rabby, WalletConnect)
  4. User configures: per-chain per-asset spending limits, enabled protocols from registry, custom contract addresses
  5. User signs one on-chain tx: deploys ZeroDev Kernel smart account (user = owner) with scoped session key for agent + spending cap policy
  6. Dashboard shows smart account address; user pastes back to agent
  7. Dashboard prompts user to set up wallet transaction alerts (Tenderly, Alchemy Notify, Forta)
- **Ongoing management:**
  - Adjust spending limits, enable/disable protocols, add custom contracts
  - Review live spending against caps
  - Revoke agent access instantly
  - Agent can request new permissions (surfaces in dashboard for user review)
  - Agent cannot modify its own permissions (dashboard is the only management interface)
- **Multi-chain UX:** Smart accounts and policies must be deployed per chain. Dashboard must make this clear and easy — show deployment status per chain, allow batch deployment, and surface which chains are active vs pending.
- **Security:** Hardcode dashboard domain in npm package (prevents phishing URLs). Human-readable tx summary before signing. Typed confirmation phrase for "skip all limits" mode.

### Issue 8: Gas Bootstrapping (Paymaster Integration)

**Depends on:** Issue 4

- Paymaster configuration for sponsored UserOperations
- Initial setup flow: deploy smart wallet + session key + spending cap policy with sponsored gas
- USDC-only onboarding: user deposits USDC, paymaster covers setup gas
- Agent self-funding: agent uses its session key permissions to swap some USDC → ETH for gas
- Transition from sponsored to self-paying gas
- ZeroDev Gas Policy to prevent gas griefing

### Issue 9: CLI Package

**Depends on:** Issues 1-4 (basic functionality), Issues 5-8 (full permission flow)

- New package in monorepo: `packages/cli/`
- CLI skeleton (commander.js or similar)
- Commands: `wallet balance`, `wallet send`, `wallet swap quote`, `wallet swap execute`
- Setup command: generates keypair, encrypts, outputs setup URL for user
- Config: reads agent key from encrypted keyfile via `loadAgentKey()`
- Consumes Actions SDK directly
- Agent-friendly: structured output for AI agent consumption (JSON mode)
- Shared core logic layer (key loading, SDK setup, output formatting) for future MCP reuse

### Issue 10: Agent Skill (Marketplace)

**Depends on:** Issue 9

- SKILL.md that teaches AI agents (Claude Code, OpenClaw, etc.) how to use the CLI
- Instructions for interpreting user commands (e.g., "swap 1 USDC to ETH" → `actions wallet swap execute 1 USDC ETH`)
- Examples of common flows: balance checks, swaps, sends
- Error handling guidance: how to interpret CLI errors and report to user
- Setup flow instructions: how to guide user through initial wallet setup
- Published to skill marketplace (OpenClaw, etc.)

---

## CoinFello Reference

CoinFello (coinfello.com) is a self-sovereign AI agent platform built on viem, ERC-4337, and ERC-7710. It offers:

- **CLI** (`@coinfello/agent-cli`): smart account creation, NL prompts, delegation management
- **A2A Protocol**: JSON-RPC 2.0 API for agent-to-agent communication
- **BYOF Mode**: headless integration where your app wraps CoinFello's backend
- **OpenClaw Skill**: MIT-licensed agent skill for Claude Code, Kiro, etc.

CoinFello could serve as:
- An alternative execution backend (replaces SDK's swap/lend integrations)
- A reference implementation for the delegation model
- A whitelabel option for the CLI

Not included in this work scope, but documented here for future evaluation. Their delegation model (ERC-7710 via MetaMask Smart Accounts Kit) is architecturally aligned with what we're building.

---

## Open Questions

1. **Turnkey for user wallets:** Maybe — depends on partnership/licensing decisions. Will Turnkey be offered as an embedded wallet option for users who don't have MetaMask/Rabby? This affects the dashboard setup flow (Issue 5).

2. **Spending cap modes at launch:** The old research defined four composable modes (USD via Chainlink, per-token, asset allowlist, unrestricted). Which modes are needed for v1? All four, or start with per-token only?

3. **Paymaster provider:** Which paymaster service will be used for gas sponsoring? The SDK's existing `DefaultSmartWallet` has paymaster support — need to confirm the specific provider (Issue 6).

## Resolved Questions

1. **Agent key storage:** Encrypted file in `~/.actions/` with decryption key in OS-native secret management (Keychain, secret-tool, 1Password, passkey). See Key Decision #5.

2. **Smart account choice:** ZeroDev Kernel (not Coinbase Smart Account). Coinbase SW is non-modular, no ERC-7579, cannot install custom validators or on-chain policies. See Key Decision #6.

3. **Permission mechanism:** ZeroDev session keys with on-chain policies (not ERC-7710). ZeroDev's system has built-in Call Policy, composable `PolicyBase` plugins, and ERC-7715 standardization. More mature for our use case.

---

## Future Consideration: Over-Limit Approval Flow

When the agent hits a spending cap, v1 simply blocks the transaction. A future enhancement could add an on-chain proposal mechanism:

1. Agent submits transaction intent on-chain (~30 lines Solidity)
2. Dashboard surfaces the pending proposal with human-readable summary
3. User reviews and approves (or rejects) from the dashboard
4. If approved, the transaction executes with the user's authority (not the session key)

This allows the agent to request one-off actions that exceed its normal permissions without requiring a permanent limit increase. Deferred — not in scope for any current issue.

---

## Security Considerations (from prior research audit)

These findings should be addressed during implementation of the relevant issues:

### Critical (must address)

- **Block infinite approvals:** Reject any `approve()` where amount exceeds remaining cap. Force exact-amount approvals to prevent stale allowance attacks.
- **Swap recipient validation:** Hybrid restriction — Call Policy rules for `transfer`/`approve`, plus custom Uniswap decoder for `execute()` recipient check. Prevents swap output directed to attacker address.
- **Hardcode dashboard domain:** The dashboard URL must be hardcoded in the npm package to prevent phishing setup URLs.
- **Fuzz testing:** Custom Solidity spending cap policy must have comprehensive fuzz testing (Foundry/Echidna) before mainnet deployment.

### High (should address)

- **`delegatecall` blocking:** Verify ZeroDev blocks `delegatecall` for session keys. Add explicit tests.
- **`permit()` signature blocking:** Signature allowlist in `checkSignaturePolicy` must reject all unapproved signature types (including EIP-712 permit messages). Only UserOperation signatures allowed.
- **"Skip all limits" safeguard:** If offering an unrestricted mode, require typed confirmation phrase (not just a toggle).
- **npm supply chain protection:** Sign the DeFi registry JSON with a known key. Dashboard and bot verify signature. Use npm provenance attestations.
- **Custom contract social engineering:** Dashboard should validate user-added contracts (verified source, deployment age) and show prominent warnings.

### Medium (address during implementation)

- **Time window boundary racing:** User could spend 2x daily cap by timing at window boundary. Mitigate with shorter windows or rolling windows.
- **Key rotation:** v1 uses revoke button (kill session key, create new one). Auto-rotation deferred.
- **Cross-chain total exposure:** Dashboard should display aggregate spending across all chains.
- **Fee-on-transfer tokens:** Spending cap will overcount (conservative — this is acceptable).
- **Gas griefing:** Use ZeroDev Gas Policy to cap gas per UserOperation.
- **Policy upgrades:** Version the spending cap contract. Dashboard detects outdated versions and prompts upgrade.
- **Dashboard CSP headers:** Prevent XSS and content injection.
- **Domain takeover monitoring:** Monitor dashboard domain for unauthorized changes.
- **Wallet transaction alerts:** Recommend Tenderly, Alchemy Notify, or Forta during setup.

---

## Prior Research Reference

Previous research spikes are documented in [`its-applekid/agent-actions/docs/`](https://github.com/its-applekid/agent-actions/tree/master/docs):

- `2026-03-08-wallet-security-threat-model.md` — 11 attack vectors, 6 wallet approach comparison, real-world incidents
- `2026-03-08-agent-actions-proposal.md` — Full ZeroDev Kernel architecture, spending cap design, setup flow, security audit findings
- `2026-03-08-agent-actions-comparison-analysis.md` — Detailed comparison matrix (Agent Actions vs .env, AWS, GOAT, AgentKit, generic smart contract)

Key findings carried forward:
- On-chain enforcement is non-negotiable (prompt injection defense)
- Defense-in-depth: off-chain registry check → Call Policy → Spending Cap Policy
- Four composable spending cap modes (USD/Chainlink, per-token, asset allowlist, unrestricted)
- Signature allowlist blocks permit() attacks
- Bot cannot modify its own permissions
- Dashboard is the only management interface
- OS keychain for key storage (confirmed and expanded with encryption-at-rest model)
