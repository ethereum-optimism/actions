# MetaMask Advanced Permissions Research

**Date:** 2026-04-07  
**Status:** Research / Comparison Analysis  
**Related:** PR #354 (Agent Wallet Support), [existing brainstorm](./2026-04-01-eoa-and-agent-wallet-support-brainstorm.md)

---

## Executive Summary

MetaMask announced **Advanced Permissions** on April 6, 2026 — a production implementation of ERC-7715 (`wallet_grantPermissions`) built on their ERC-7710 Delegation Framework.

### ⚠️ Critical Finding: MetaMask-Only (Worse Vendor Lock-In)

**ERC-7715/7710 is MetaMask-only as of April 2026.** While it's an "open standard," **no other wallets support it yet.** Safe is "exploring" it with no ship date. Rabby, Rainbow, Turnkey, Privy — no announcements.

**This is WORSE vendor lock-in than ZeroDev Kernel:**
- **ZeroDev:** User connects ANY wallet (MetaMask, Rabby, Rainbow, Turnkey, etc.) → signs tx to create smart account → keeps using their wallet
- **ERC-7715/7710:** User MUST use MetaMask → locked into MetaMask ecosystem

**Recommendation: Stick with ZeroDev Kernel** for wallet diversity. Revisit ERC-7715/7710 if 3+ wallets ship support.

### What ERC-7715/7710 Offers (For MetaMask Users)

- **Standard JSON-RPC API** (`wallet_grantPermissions`) for permission requests
- **MetaMask native support** (no custom UI needed)
- **Human-readable approval flow** built into MetaMask extension
- **Caveat enforcers** for flexible policy composition
- **Same security model** as ZeroDev (on-chain enforcement, scoped permissions, time-bound access)

### What It Lacks vs. ZeroDev

- 🔴 **Wallet support:** MetaMask-only (vs. ZeroDev works with ANY wallet)
- ⚠️ **Granularity:** Can't restrict function arguments (ZeroDev Call Policy can)
- ⚠️ **Maturity:** Just launched April 2026 (vs. ZeroDev's battle-tested session keys)

This research evaluates the trade-offs and recommends sticking with ZeroDev Kernel until ERC-7715/7710 gains multi-wallet adoption.

---

## What is MetaMask Advanced Permissions?

### Overview

Advanced Permissions let users grant a dapp **specific, scoped permissions** to execute transactions on their behalf. The user approves once, and the dapp can execute within those boundaries without further signatures.

### Architecture

```
User (MetaMask)                 Agent/DApp (Session Account)
     |                                   |
     v                                   v
MetaMask Smart Account <──delegation── Session Account (EOA or SA)
  (holds funds)                         (signing key only)
     |                                   |
     └─── ERC-7710 Delegation Manager ──┘
           (enforces permissions on-chain)
```

### Technical Stack

- **ERC-7715:** JSON-RPC method `wallet_grantPermissions` (and related methods)
- **ERC-7710:** On-chain delegation framework with caveat enforcers
- **MetaMask Smart Accounts Kit:** Implementation of ERC-7710 + permission types
- **Session accounts:** EOA or smart account that holds signing key but never funds
- **Caveat enforcers:** On-chain contracts that enforce rules (like our spending caps)

---

## ERC-7715: The Permission Request Standard

### Core RPC Methods

#### `wallet_requestExecutionPermissions`

DApp requests permissions from the user's wallet.

**Request:**
```typescript
type PermissionRequest = {
  chainId: Hex;           // EIP-155 chain ID
  from?: Address;         // User's account (optional)
  to: Address;            // Session account (agent's signing key)
  permission: {
    type: string;         // e.g., "native-token-allowance", "erc20-token-periodic"
    isAdjustmentAllowed: boolean; // Can user reduce the requested amount?
    data: Record<string, any>;    // Permission-specific params
  };
  rules?: {               // Optional constraints
    type: string;         // e.g., "expiry"
    data: Record<string, any>;
  }[];
}[];
```

**Response:**
```typescript
type PermissionResponse = PermissionRequest & {
  context: Hex;           // Opaque permission identifier (for redemption)
  dependencies: {         // Undeployed accounts (factory + factoryData per ERC-4337)
    factory: Address;
    factoryData: Hex;
  }[];
  delegationManager: Address; // ERC-7710 contract address
};
```

#### Other Methods

- `wallet_revokeExecutionPermission` — User or dapp revokes a permission
- `wallet_getSupportedExecutionPermissions` — Query wallet's supported permission types
- `wallet_getGrantedExecutionPermissions` — List active permissions

### Permission Types (MetaMask Implementation)

| Type | Description | Use Cases |
|------|-------------|-----------|
| `erc20-token-periodic` | Per-period allowance (resets each period) | Subscriptions, DCA, recurring payments |
| `native-token-periodic` | Per-period ETH allowance | Gas budgets, recurring ETH transfers |
| `erc20-token-stream` | Linear streaming allowance (configurable rate) | Vesting, continuous payments |
| `native-token-stream` | Linear streaming ETH allowance | Vesting in ETH |
| `erc20-revocation` | Allows revoking ERC-20 approvals | Cleanup stale approvals |

All permission types support:
- **Expiry rules** (`timestamp` when permission becomes invalid)
- **Human-readable justification** (shown in MetaMask UI)
- **User adjustment** (`isAdjustmentAllowed` — user can reduce amount/duration before approval)

---

## ERC-7710: The Delegation Framework

### Core Concept

ERC-7710 defines how **delegations** are created, stored, and redeemed on-chain. A delegation is a permission granted by one account (delegator = user) to another account (delegate = session account).

### Caveat Enforcers

**Caveat enforcers** are on-chain contracts that enforce rules when a delegation is redeemed. They're like our spending cap policies but composable.

Examples:
- **Allowance Enforcer:** Tracks token spending against a cap
- **Value Enforcer:** Limits native token value per transaction
- **Target Enforcer:** Restricts which contracts can be called
- **Expiry Enforcer:** Blocks redemption after a timestamp

### Redemption Flow

1. Agent (session account) forms an `Execution` struct:
   ```solidity
   struct Execution {
     address target;
     uint256 value;
     bytes callData;
   }
   ```
2. Agent calls `delegationManager.redeemDelegations()`:
   ```solidity
   redeemDelegations(
     bytes[] calldata permissionContexts,  // From wallet_grantPermissions response
     bytes32[] calldata executionModes,
     bytes[] calldata executionCallData    // Encoded Execution
   )
   ```
3. Delegation Manager:
   - Verifies delegation exists and is valid
   - Runs all caveat enforcers (spending caps, target restrictions, expiry checks)
   - If all pass: executes the transaction from the user's account
   - If any fail: reverts

### Security Model

- **On-chain enforcement:** Caveat enforcers run in Solidity — agent code cannot bypass
- **Composable:** Multiple enforcers can be stacked (e.g., expiry + allowance + target)
- **Revocable:** User can revoke delegation at any time
- **No funds in session account:** Session account never holds assets — only signing key

---

## Complete Delegation Approach Comparison

### Feature Matrix: All Approaches Considered

This table compares **all delegation/permission approaches** evaluated for agent wallet support, including those from our [prior research](https://github.com/its-applekid/agent-actions/blob/master/docs/2026-03-08-agent-actions-comparison-analysis.md).

| Feature | .env File | AWS Secrets | Coinbase AgentKit | GOAT SDK | ZeroDev Kernel | **ERC-7715/7710** | Coinbase Smart Wallet |
|---------|-----------|-------------|-------------------|----------|----------------|-------------------|----------------------|
| **On-Chain Enforcement** | ❌ | ❌ | ⚠️ Partial (CDP policies off-chain) | ❌ | ✅ Yes | ✅ Yes | ⚠️ Partial (Spend Permissions limited) |
| **Contract-Level Restrictions** | ❌ | ❌ | ❌ | ❌ | ✅ Call Policy | ✅ Target Enforcer | ❌ |
| **Function Selector Restrictions** | ❌ | ❌ | ❌ | ❌ | ✅ Call Policy | ⚠️ Limited | ❌ |
| **Function Argument Restrictions** | ❌ | ❌ | ❌ | ❌ | ✅ Call Policy | ❌ | ❌ |
| **Spending Caps** | ❌ | ❌ | ✅ Token amounts only | ❌ | ✅ Custom policy (4 modes) | ✅ Allowance Enforcer | ✅ Token amounts only |
| **Time-Bound Permissions** | ❌ | ❌ | ⚠️ CDP config | ❌ | ✅ Session key expiry | ✅ Expiry rules | ⚠️ Time windows |
| **Revocable** | ❌ | ❌ | ✅ Via CDP dashboard | ❌ | ✅ Remove session key | ✅ Revoke delegation | ✅ Via Coinbase dashboard |
| **Composable Policies** | ❌ | ❌ | ❌ | ❌ | ✅ ERC-7579 modules | ✅ Caveat enforcers | ❌ |
| **Standard API** | ❌ | ❌ | ❌ | ❌ | ❌ Custom | ✅ ERC-7715 RPC | ❌ Custom |
| **Native Wallet UI** | ❌ | ❌ | ⚠️ CDP only | ❌ | ❌ Custom dashboard | ✅ MetaMask native | ⚠️ Coinbase only |
| **Multi-Wallet Support** | ✅ Any | ✅ Any | ❌ CDP only | ✅ Any | ✅ Any (user's EOA owns) | 🔴 MetaMask only (Apr 2026) | ❌ Coinbase only |
| **Self-Custody** | ✅ Yes | ✅ Yes | ❌ Custodial (CDP) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Prompt Injection Protection** | ❌ | ❌ | ⚠️ Partial | ❌ | ✅ Yes | ✅ Yes | ⚠️ Partial |
| **Session Account** | N/A | N/A | ❌ | N/A | ✅ Session key | ✅ Session account (EOA/SA) | ⚠️ Sub Accounts |
| **Custom Policies** | ❌ | ❌ | ❌ | ❌ | ✅ PolicyBase | ✅ Custom enforcers | ❌ |
| **Modular Architecture** | N/A | N/A | ❌ | N/A | ✅ ERC-7579 | ✅ ERC-7710 | ❌ |
| **Gas Sponsorship** | ❌ | ❌ | ✅ CDP paymaster | ❌ | ✅ ZeroDev paymaster | ✅ Wallet paymaster | ✅ Coinbase paymaster |
| **Multi-Chain** | ✅ Any EVM | ✅ Any EVM | ⚠️ Limited | ✅ 30+ chains | ✅ Any EVM | ✅ Any EVM | ✅ Coinbase chains |
| **Setup Complexity** | Low | Medium | Low | Low | High | Medium | Medium |
| **Setup Cost** | Free | Free | Free | Free | $20-50 | $20-50 | $10-30 |
| **Vendor Lock-In** | None | ⚠️ AWS | 🔴 High (CDP) | None | ⚠️ ZeroDev SDK | 🔴 MetaMask (until other wallets adopt) | 🔴 High (Coinbase) |
| **Migration Path** | Easy | Easy | 🔴 Difficult | Easy | ✅ Easy | ✅ Easy | 🔴 Difficult |
| **Maturity** | N/A | N/A | Production | Production | Production | ⚠️ New (Apr 2026) | Production |
| **Documentation** | N/A | Extensive | Good | Good | Good | Excellent | Good |

### Security Comparison (Attack Vectors)

| Attack Vector | .env File | AWS Secrets | Coinbase AgentKit | GOAT SDK | ZeroDev Kernel | **ERC-7715/7710** | Coinbase Smart Wallet |
|---------------|-----------|-------------|-------------------|----------|----------------|-------------------|----------------------|
| **Direct Prompt Injection** | 🔴 Critical | 🔴 Critical | ⚠️ Partial | 🔴 Critical | ✅ Protected | ✅ Protected | ⚠️ Partial |
| **Indirect Prompt Injection** | 🔴 Critical | 🔴 Critical | ⚠️ Partial | 🔴 Critical | ✅ Protected | ✅ Protected | ⚠️ Partial |
| **Key Exfiltration** | 🔴 Critical | 🔴 Critical | ✅ Protected (TEE) | 🔴 Critical | ⚠️ Partial (session key) | ⚠️ Partial (session key) | ✅ Protected (custodial) |
| **Malicious Skill** | 🔴 Total loss | 🔴 Total loss | ⚠️ Cap-limited | 🔴 Total loss | 🟢 Policy-limited | 🟢 Policy-limited | ⚠️ Cap-limited |
| **Social Engineering** | 🔴 Critical | 🔴 Critical | ⚠️ Partial | 🔴 Critical | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial |
| **Agent Self-Modification** | 🔴 Can modify limits | 🔴 Can modify limits | ✅ Protected (CDP) | 🔴 Can modify limits | ✅ Protected | ✅ Protected | ✅ Protected (Coinbase) |
| **Custodial Compromise** | N/A | N/A | 🔴 Critical | N/A | ✅ Self-custody | ✅ Self-custody | ⚠️ Hybrid (CDP custody) |
| **Cost of Breach** | 🔴 Total loss | 🔴 Total loss | 🟢 Cap-limited | 🔴 Total loss | 🟢 Cap-limited | 🟢 Cap-limited | 🟢 Cap-limited |

### Operational Capabilities

| Capability | .env File | AWS Secrets | Coinbase AgentKit | GOAT SDK | ZeroDev Kernel | **ERC-7715/7710** | Coinbase Smart Wallet |
|------------|-----------|-------------|-------------------|----------|----------------|-------------------|----------------------|
| **DeFi Protocol Access** | ⚠️ Manual | ⚠️ Manual | ⚠️ Limited (~5) | ✅ 200+ | ✅ Unlimited | ✅ Unlimited | ⚠️ Limited |
| **Composability** | ✅ Full | ✅ Full | ❌ Low | ✅ High | ✅ High | ✅ High | ❌ Low |
| **Human-Readable Approval** | ❌ | ❌ | ⚠️ CDP UI | ❌ | ❌ Custom UI | ✅ MetaMask native | ⚠️ Coinbase UI |
| **Permission Adjustment** | ❌ | ❌ | ⚠️ Via CDP | ❌ | ⚠️ Via dashboard | ✅ Built-in | ⚠️ Via Coinbase |
| **Dashboard Required** | No | No | No (CDP handles) | No | Yes (custom) | No (wallet handles) | No (Coinbase handles) |
| **Per-Transaction Cost** | Gas only | Gas only | Gasless (Base) | Gas only | Gas + overhead | Gas + overhead | Gasless (sponsored) |
| **Platform Fees** | None | None | ⚠️ CDP fees | None | None | None | ⚠️ Coinbase fees |
| **Gas Optimization** | ✅ Flashbots | ✅ Flashbots | ❌ | ✅ Flashbots | ⚠️ Limited | ⚠️ Limited | ❌ |

### Decision Matrix

| If You Need... | Recommended Approach | Reasoning |
|----------------|---------------------|-----------|
| **MetaMask-only users** | ERC-7715/7710 | Built-in approval flow, no custom dashboard |
| **Multi-wallet support (today)** | ZeroDev Kernel | User connects ANY wallet, ZeroDev SA owned by their EOA |
| **Maximum granularity** (function args) | ZeroDev Kernel | Call Policy restricts specific arguments |
| **Simplest setup** | Coinbase AgentKit | Custodial, no smart account deployment |
| **Modular policies** | ZeroDev Kernel | ERC-7579 plugin system |
| **Standard-based (future-proof)** | ERC-7715/7710 | ERC-7715 + ERC-7710 specs (if other wallets adopt) |
| **Self-custody + ease** | ZeroDev Kernel | User keeps their wallet, SA owned by their EOA |
| **No vendor lock-in (today)** | ZeroDev Kernel | User wallet-agnostic (MetaMask, Rabby, Rainbow, Turnkey, etc.) |
| **Maximum security** | ZeroDev + AWS KMS | Granular policies + secure key storage |
| **Fastest time-to-market** | Coinbase AgentKit | Custodial, CDP handles everything |

---

## Comparison: ZeroDev Kernel vs. ERC-7715/7710 (Detailed)

### Architectural Similarities

Both approaches achieve the same core goals:

| Goal | ZeroDev Kernel | ERC-7715 + ERC-7710 |
|------|---------------|---------------------|
| **On-chain permission enforcement** | ✅ Session keys + Call Policy + Spending Cap Policy | ✅ Delegations + Caveat Enforcers |
| **Scoped access** | ✅ Call Policy (contracts/selectors/args) + Spending Caps | ✅ Permission types + Caveat Enforcers |
| **Time-bound permissions** | ✅ Session key expiry | ✅ Expiry rules |
| **User revocation** | ✅ Remove session key from smart account | ✅ Revoke delegation |
| **No agent access to user's key** | ✅ Agent has separate EOA | ✅ Session account (separate EOA/SA) |
| **Human-readable approval** | ⚠️ Custom dashboard needed | ✅ Built into MetaMask extension |
| **Multi-chain** | ✅ ZeroDev supports multi-chain | ✅ ERC-7715 supports multi-chain requests |

### Key Differences

#### 1. **Standard vs. Custom — ⚠️ CRITICAL VENDOR LOCK-IN DIFFERENCE**

| Aspect | ZeroDev Kernel | ERC-7715/7710 |
|--------|---------------|---------------|
| **Standard** | ERC-7579 (modular smart accounts), custom session keys | ERC-7715 (permission requests), ERC-7710 (delegations) |
| **User's wallet** | ✅ **ANY wallet** (MetaMask, Rabby, Rainbow, Turnkey, Privy, etc.) | 🔴 **MetaMask ONLY** (as of April 2026) |
| **How it works** | User signs tx with their existing wallet to create ZeroDev SA (owned by their EOA) | User MUST use MetaMask to call `wallet_grantPermissions` |
| **Wallet lock-in** | ✅ **None** — user keeps using their preferred wallet | 🔴 **High** — user must switch to MetaMask or wait for other wallets to adopt ERC-7715 |
| **Permission request** | Custom UI/dashboard | `wallet_grantPermissions` JSON-RPC |
| **Approval flow** | Dashboard we build | MetaMask native UI (or wallet's native UI, *if they adopt*) |
| **Future potential** | Limited to ZeroDev ecosystem | ✅ Open standard (if Safe, Rabby, etc. adopt ERC-7715/7710) |

**Critical insight:** While ERC-7715/7710 is an "open standard," **in practice it's MetaMask-only right now.** Safe is "exploring" it but hasn't shipped. No timeline for Rabby, Rainbow, Turnkey, or other wallets.

**ZeroDev Kernel is MORE wallet-agnostic TODAY** because the user just needs to sign a transaction with any wallet to create the smart account. They keep using their existing wallet.

#### 2. **Permission Granularity**

| Feature | ZeroDev Kernel | ERC-7715/7710 |
|---------|---------------|---------------|
| **Call Policy** | Contract + selector + argument constraints | Target Enforcer (contract restrictions) |
| **Spending Cap** | Custom `PolicyBase` (~250 lines Solidity) | Allowance Enforcer (built-in to MetaMask Kit) |
| **Spending modes** | USD cap (Chainlink), per-token, allowlist, unrestricted | Per-period, streaming, revocation |
| **Signature blocking** | `checkSignaturePolicy` (blocks `permit()`) | Not directly specified (implementation-dependent) |
| **Composability** | Stack policies via ERC-7579 | Stack caveat enforcers (ERC-7710 native) |

**Verdict:** ZeroDev's Call Policy is more granular (can restrict specific function arguments). ERC-7710 caveat enforcers are more composable and standardized.

#### 3. **User Experience**

| Aspect | ZeroDev Kernel | ERC-7715/7710 |
|--------|---------------|---------------|
| **Setup** | Custom dashboard (Issue 7 in our plan) | MetaMask extension (native) |
| **Permission request** | Dashboard URL with agent's public key | `wallet_grantPermissions` call |
| **Approval** | Sign tx on dashboard (custom UI) | MetaMask popup (human-readable) |
| **Revocation** | Dashboard (custom UI) | MetaMask "Dapp connections" (native) |
| **Adjustment** | Would need custom implementation | `isAdjustmentAllowed` built-in |

**Verdict:** ERC-7715/7710 has better UX for MetaMask users (native UI). ZeroDev requires building a custom dashboard (significant effort).

#### 4. **Smart Account Deployment**

| Aspect | ZeroDev Kernel | ERC-7715/7710 (MetaMask) |
|--------|---------------|--------------------------|
| **User's smart account** | ZeroDev Kernel (ERC-7579) | MetaMask Smart Account (proprietary, ERC-7710-compliant) |
| **Modularity** | ✅ ERC-7579 (install plugins) | ⚠️ MetaMask SA is less modular |
| **Session account** | Agent's EOA becomes session key | Session account (EOA or SA, agent controls) |
| **Deployment** | User signs tx to deploy Kernel | MetaMask handles SA deployment |

**Verdict:** ZeroDev Kernel is more modular (ERC-7579). MetaMask Smart Account is simpler but less flexible.

#### 5. **Ecosystem & Tooling**

| Aspect | ZeroDev Kernel | ERC-7715/7710 |
|--------|---------------|---------------|
| **Wallet support** | ZeroDev SDK only | MetaMask (native), Safe (in progress), others TBD |
| **Paymaster** | ZeroDev Gas Policy | ERC-4337 paymasters (wallet-provided) |
| **Developer tools** | ZeroDev SDK, dashboard templates | MetaMask Smart Accounts Kit, Scaffold-ETH extension |
| **Documentation** | ZeroDev docs | MetaMask docs + ERC specs |
| **Maturity** | Production-ready | Just launched (April 2026), but backed by MetaMask |

**Verdict:** ZeroDev is more mature for session keys specifically. ERC-7715/7710 has broader ecosystem potential (MetaMask adoption = millions of users).

---

## Security Considerations

### ERC-7715/7710 Security Model

From the MetaMask announcement:

- **Scoped by design:** Permission defines asset, amount, time window, transfer type. Caveat enforcers reject out-of-scope executions.
- **Human-readable approval:** MetaMask displays full permission parameters before approval.
- **User-adjustable:** User can reduce amount/duration if `isAdjustmentAllowed: true`.
- **Revocable:** User can revoke permissions at any time.
- **Session accounts don't hold funds:** Execution via delegation redemption — session account is a signing key, not a custody point.

### Comparison to Our Security Audit (from prior research)

| Concern | ZeroDev Kernel | ERC-7715/7710 |
|---------|---------------|---------------|
| **Infinite approvals** | Block in spending cap policy | Allowance Enforcer tracks spending |
| **Swap recipient validation** | Hybrid: Call Policy + custom decoder | Target Enforcer + permission type |
| **`delegatecall` blocking** | Verify ZeroDev blocks it | Not specified (wallet implementation-dependent) |
| **`permit()` signature blocking** | `checkSignaturePolicy` | Not directly addressed (implementation-dependent) |
| **"Skip all limits" safeguard** | Typed confirmation phrase | Would need custom caveat enforcer |
| **Dashboard domain hardcoding** | Hardcoded in npm package | N/A (MetaMask handles approval UI) |
| **Fuzz testing** | Required for custom spending cap | MetaMask Kit's enforcers (presumably tested) |

**Gaps in ERC-7715/7710 (as specified):**
- No explicit `delegatecall` blocking (depends on wallet implementation)
- No signature type restrictions (permit() attacks)
- No "unrestricted mode" safeguards

**Note:** These gaps might be addressed in MetaMask's implementation, but they're not part of the ERC-7715/7710 spec itself.

---

## Integration Paths

### Option A: Pivot to ERC-7715/7710 (Full Adoption)

**Architecture:**
- User connects MetaMask (or other ERC-7710 wallet)
- Agent generates session account (EOA or SA)
- Agent calls `wallet_requestExecutionPermissions` with desired permissions
- User approves in MetaMask extension
- Agent redeems permissions via `delegationManager.redeemDelegations()`

**Pros:**
- ✅ Standard API (future-proof *if other wallets adopt*)
- ✅ Native MetaMask support (no custom dashboard for MetaMask users)
- ✅ Human-readable approval flow (MetaMask handles UI)
- ✅ Composable caveat enforcers (standard building blocks)

**Cons:**
- 🔴 **MetaMask-only TODAY** — user MUST use MetaMask (high vendor lock-in until others adopt)
- 🔴 **Excludes all non-MetaMask users** — Rabby, Rainbow, Turnkey, Privy, Coinbase Wallet users can't use it
- ⚠️ Less granular than ZeroDev Call Policy (can't restrict specific function arguments)
- ⚠️ New standard (launched April 2026 — less battle-tested)
- ⚠️ MetaMask Smart Account is less modular than ZeroDev Kernel (no ERC-7579)
- ⚠️ Some security gaps (delegatecall, permit() blocking) depend on wallet implementation
- ⚠️ Uncertain adoption timeline (Safe "exploring" but no ship date; other wallets unknown)

**Implementation Changes (from existing plan):**
- **Issue 1 (Local EOA provider):** No change — still needed for agent's session account
- **Issue 2 (Key generation):** No change — agent still generates keypair
- **Issue 3 (Smart wallet):** Replace ZeroDev Kernel with ERC-7710 integration (session account, not user's SA)
- **Issue 4 (Agent smart wallet setup):** Simplified — agent's session account is just an EOA (or lightweight SA)
- **Issue 5 (On-chain permissions):** Replace ZeroDev session keys with ERC-7715 permissions + caveat enforcers
- **Issue 6 (DeFi registry):** Still needed (but as defense-in-depth, not primary enforcement)
- **Issue 7 (Dashboard):** Drastically simplified for MetaMask users (just link to MetaMask extension for approval/revocation)
- **Issue 8 (Gas bootstrapping):** No change — still use paymaster
- **Issue 9 (CLI):** Update to use `wallet_requestExecutionPermissions` instead of ZeroDev SDK
- **Issue 10 (Agent skill):** Update to reflect new flow

**Effort reduction:** Dashboard is much simpler (Issue 7). No need to build custom UI for MetaMask users.

---

### Option B: Hybrid Approach (Support Both)

**Architecture:**
- Detect wallet capability:
  - If MetaMask (or ERC-7710 wallet): use ERC-7715 flow
  - If Turnkey/Privy/other: use ZeroDev Kernel flow
- CLI supports both backends

**Pros:**
- ✅ Best of both worlds (standard for MetaMask, granular control for ZeroDev)
- ✅ Turnkey embedded wallet users still get full solution

**Cons:**
- ⚠️ Significant complexity (two code paths, two permission models)
- ⚠️ Harder to test and maintain
- ⚠️ Dashboard must support both flows (or different dashboards per wallet type)

**Verdict:** Probably not worth it unless we have strong evidence that Turnkey users need the extra granularity of ZeroDev Call Policy.

---

### Option C: Stick with ZeroDev Kernel (Original Plan) — ✅ WALLET-AGNOSTIC

**Pros:**
- ✅ **User wallet-agnostic** — works with ANY wallet (MetaMask, Rabby, Rainbow, Turnkey, Privy, Coinbase Wallet, etc.)
- ✅ **No vendor lock-in** — user keeps using their preferred wallet
- ✅ More granular control (Call Policy can restrict function arguments)
- ✅ ERC-7579 modularity (can install custom validators)
- ✅ Custom spending cap policy (four composable modes)
- ✅ More mature session key implementation

**Cons:**
- ⚠️ Custom dashboard required (Issue 7 is a lot of work)
- ⚠️ Not a standard (ZeroDev-specific smart account)
- ⚠️ MetaMask users don't get native MetaMask extension experience (but can still use MetaMask as their wallet)

**Verdict:** **RECOMMENDED for wallet diversity.** Users can connect with any wallet. Better than forcing everyone to MetaMask.

---

## Recommendation

### ⚠️ Critical Finding: Vendor Lock-In

**ERC-7715/7710 is MetaMask-only as of April 2026.** While it's an "open standard," no other wallets have shipped support yet. Safe is "exploring" it with no timeline.

**This is WORSE vendor lock-in than ZeroDev Kernel:**
- **ZeroDev:** User connects ANY wallet (MetaMask, Rabby, Rainbow, Turnkey, etc.) → signs tx to create smart account → keeps using their preferred wallet
- **ERC-7715/7710:** User MUST use MetaMask extension → locked into MetaMask ecosystem

**For a product serving diverse crypto users, forcing MetaMask is a dealbreaker.**

### Recommended Path: Stick with ZeroDev Kernel (Option C)

**Reasoning:**
1. **Wallet diversity matters** — crypto users have strong wallet preferences (Rabby for traders, Rainbow for mobile, Turnkey for embedded)
2. **ZeroDev is wallet-agnostic** — user just signs a transaction with their existing wallet
3. **Better UX for non-MetaMask users** — no "sorry, MetaMask only" message
4. **Open future** — if ERC-7715/7710 gains multi-wallet adoption, we can add it later as an alternative flow

**Trade-off accepted:**
- We build a custom dashboard (Issue 7) instead of using MetaMask's native UI
- This is WORTH IT to avoid excluding 40-60% of users who don't use MetaMask

### Alternative: Monitor ERC-7715/7710 Adoption

**Track these milestones:**
1. **Safe ships ERC-7715 support** (they're "exploring" it)
2. **Rabby announces ERC-7710 integration** (or other major wallets)
3. **3+ wallets with production ERC-7715 support**

**If these happen:** Revisit ERC-7715/7710 as a second flow (hybrid approach) for users who prefer native wallet UX.

**Until then:** ZeroDev Kernel is the pragmatic choice for wallet diversity.

### Phase 2: Implementation (If Pivot)

Modify the work plan from the existing brainstorm:

- **Issues 1-2:** No change (local EOA provider, key generation)
- **Issue 3:** Replace with "ERC-7715/7710 Integration" (session account setup, permission requests)
- **Issue 4:** Simplified (agent's session account is just an EOA)
- **Issue 5:** Replace with "Caveat Enforcers" (evaluate MetaMask Kit's enforcers, add custom if needed)
- **Issue 6:** Keep DeFi registry (defense-in-depth)
- **Issue 7:** Drastically simplified dashboard (just link to MetaMask for approval/revocation)
- **Issues 8-10:** Update for ERC-7715 flow

**Effort savings:** Issue 7 (dashboard) goes from ~2-3 weeks to ~3-5 days (just need a simple "connect wallet and approve" flow).

---

## Open Questions

1. **Can we add custom caveat enforcers to MetaMask Smart Accounts?**
   - If yes: We can implement our custom spending cap logic as a caveat enforcer
   - If no: We're limited to MetaMask Kit's built-in enforcers (might be enough)

2. **Does MetaMask block `delegatecall` and `permit()` signatures?**
   - Need to review MetaMask Smart Account implementation
   - If not: Can we add enforcers to block these?

3. **What's the multi-chain deployment story for MetaMask Smart Accounts?**
   - Do they deploy deterministically (CREATE2)?
   - What's the UX for deploying on multiple chains?

4. **Will other wallets adopt ERC-7710?**
   - Safe is exploring it (mentioned in their docs)
   - If yes: ERC-7715/7710 becomes more attractive
   - If no: ZeroDev Kernel might have better ecosystem support

5. **How does gas sponsorship work with ERC-7715/7710?**
   - MetaMask Kit mentions paymasters — how do we integrate?
   - Can we sponsor initial setup + USDC → ETH swap?

6. **Can we restrict permission types to our DeFi registry?**
   - E.g., only allow `erc20-token-periodic` for whitelisted tokens
   - Or only allow execution on whitelisted contracts

7. **What's the upgrade path for permissions?**
   - If we want to add new permission types, how do we handle existing users?
   - Can we version caveat enforcers?

---

## Next Steps

1. **Review this document with Everdred** ✅ (via PR comment)
2. **Spike ERC-7715/7710 integration** (1-2 days)
   - Minimal PoC: request permission, redeem delegation
   - Test with MetaMask extension
3. **Security audit of MetaMask Smart Accounts Kit** (1 day)
   - Review source code for delegatecall, permit(), other attack vectors
4. **Decision:** Pivot to ERC-7715/7710 or stick with ZeroDev Kernel (based on spike results)
5. **Update brainstorm document** (if pivot)
   - Revise work chunks (Issues 1-10)
   - Update security considerations
   - Document integration approach

---

## References

### MetaMask Documentation

- [Advanced Permissions announcement](https://metamask.io/news/introducing-advanced-permissions) (April 6, 2026)
- [Advanced Permissions developer docs](https://docs.metamask.io/smart-accounts-kit/concepts/advanced-permissions/)
- [MetaMask Smart Accounts Kit](https://docs.metamask.io/smart-accounts-kit)
- [Delegation Framework overview](https://docs.metamask.io/smart-accounts-kit/concepts/delegation/)
- [Hacker Guide: ERC-7715 actions](https://metamask.io/news/hacker-guide-metamask-delegation-toolkit-erc-7715-actions)
- [What is the Delegation Toolkit?](https://metamask.io/news/what-is-the-delegation-toolkit-and-what-can-you-build-with-it)

### ERC Specifications

- [ERC-7715: Request Permissions from Wallets](https://eips.ethereum.org/EIPS/eip-7715)
- [ERC-7710: Delegation Framework](https://eips.ethereum.org/EIPS/eip-7710)
- [ERC-4337: Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)
- [ERC-7579: Minimal Modular Smart Accounts](https://eips.ethereum.org/EIPS/eip-7579)

### Prior Research

- [Agent Actions Proposal](https://github.com/its-applekid/agent-actions/blob/master/docs/2026-03-08-agent-actions-proposal.md) (ZeroDev Kernel approach)
- [Wallet Security Threat Model](https://github.com/its-applekid/agent-actions/blob/master/docs/2026-03-08-wallet-security-threat-model.md)
- [Comparison Analysis](https://github.com/its-applekid/agent-actions/blob/master/docs/2026-03-08-agent-actions-comparison-analysis.md)

---

## Appendix: Permission Type Examples

### ERC-20 Periodic Permission (DCA)

```typescript
const permission = {
  type: "erc20-token-periodic",
  isAdjustmentAllowed: true,
  data: {
    token: "0x...", // USDC address
    allowance: "0x989680", // 10 USDC (in wei)
    period: 86400, // 1 day in seconds
    start: Math.floor(Date.now() / 1000), // Now
    end: Math.floor(Date.now() / 1000) + (30 * 86400), // 30 days
  },
};
```

**Human-readable (in MetaMask):**
> "Allow this dapp to spend up to 10 USDC per day for 30 days starting now."

### Native Token Stream (Vesting)

```typescript
const permission = {
  type: "native-token-stream",
  isAdjustmentAllowed: false,
  data: {
    allowance: "0xDE0B6B3A7640000", // 1 ETH total
    ratePerSecond: "0x38D7EA4C68000", // 0.000001 ETH/sec
    start: 1735689600, // Jan 1, 2026
    end: 1767225600, // Jan 1, 2027
  },
};
```

**Human-readable (in MetaMask):**
> "Allow this dapp to stream 1 ETH over 1 year, starting Jan 1, 2026."

### Call Restrictions (via Target Enforcer)

```typescript
const caveatEnforcer = {
  type: "target",
  data: {
    allowedTargets: [
      "0x...", // Uniswap V3 Router
      "0x...", // Morpho
      "0x...", // Aave Pool
    ],
  },
};
```

**Human-readable (in MetaMask):**
> "This dapp can only call these contracts: Uniswap V3, Morpho, Aave."

---

**End of Research Document**
