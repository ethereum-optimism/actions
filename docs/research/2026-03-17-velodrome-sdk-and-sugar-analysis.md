---
date: 2026-03-17
topic: velodrome-sdk-and-sugar-contracts
---

# Velodrome SDK & Sugar Contracts Analysis

Research into `velodrome-finance/sdk.js` and `velodrome-finance/sugar` for potential integration with the Actions SDK's VelodromeSwapProvider.

## Sugar Contracts (`velodrome-finance/sugar`)

On-chain read-only API contracts (Vyper) deployed on all 12 OP Stack chains. Consolidate complex multi-call data retrieval into single paginated calls.

### Key Contracts

| Contract | Purpose |
|----------|---------|
| LpSugar | Pool data, positions, swap routing info |
| TokenSugar | Token metadata, balances, listing status |
| RewardsSugar | Epoch rewards, bribes, fees |
| VeSugar | veNFT locks, votes, governance |
| RelaySugar | Autocompounder/autoconverter relay data |

### `LpSugar.forSwaps()` — Most Relevant

Returns pool data optimized for swap routing:

```vyper
struct SwapLp:
  lp: address        # Pool contract address
  type: int24        # -1 = v2 stable, 1 = v2 volatile, >1 = CL tick spacing
  token0: address
  token1: address
  factory: address
  pool_fee: uint256
```

Pagination: `forSwaps(_limit, _offset)`. The SDK uses ~90 per batch, max 300.

### Other Useful Functions

- `all(_limit, _offset, _filter)` — Full pool data (30+ fields) including reserves, gauge info, emissions, TVL
- `tokens(_limit, _offset, _account, _addresses)` — Token metadata with balances
- `count()` — Total pool count

### Deployment Addresses

Hub chains (Optimism, Base) have full Sugar suites. Leaf chains have LpSugar, TokenSugar, and RewardsSugar.

| Chain | ID | LpSugar |
|-------|----|---------|
| Optimism | 10 | `0x1d5E1893fCfb62CAaCE48eB2BAF7a6E134a8a27c` |
| Celo | 42220 | `0x694146cC19AE71bFa95601e8093594b1f71CF877` |
| Fraxtal | 252 | `0xc703cDA5468bE663e4546C495E1D0E503082A8e0` |
| Ink | 57073 | `0x46e07c9b4016f8E5c3cD0b2fd20147A4d0972120` |
| Lisk | 1135 | `0x2002618dd63228670698200069E42f4422e82497` |
| Metal | 1750 | `0xB2CaA2742DD3b640e7f76EdfE74C84f725150014` |
| Mode | 34443 | `0x280AC155a06e2aDB0718179C2f916BA90C32FEAB` |
| Soneium | 1868 | `0xf25D27572E122F78101FA5c37e94Cb2E880D8Edb` |
| Superseed | 5330 | `0x0Fb2AF1052D5f39540400E167EE5ACCb3cD2AF00` |
| Swell | 1923 | `0x215cEad02e0b9E0E494DD179585C18a772048a43` |
| Unichain | 130 | `0x46e07c9b4016f8E5c3cD0b2fd20147A4d0972120` |

Base (8453) addresses in `base.env` in the repo.

---

## Sugar SDK (`velodrome-finance/sdk.js`)

Official TypeScript SDK (`@dromos-labs/sdk.js`). Version 0.3.0-alpha.3. Core routing logic extracted from the production Velodrome frontend.

### Public API

- `getListedTokens()` — Fetch all listed tokens across configured chains
- `getQuoteForSwap()` — Find best swap route and quote across all pools
- `getCallDataForSwap()` — Get encoded Universal Router calldata
- `swap()` — Execute a swap or return unsigned tx data
- `approve()` — ERC20 token approval

### Architecture

Monorepo with `sugar-sdk` (core), `demo-node`, `demo-web`, `docs`, `honey` (local test infra), `claudius` (AI agent experiments).

Dependencies: `viem` (peer), `@wagmi/core` (peer), `graphology` + `graphology-simple-path` (routing), `ramda`.

### Multi-Hop Router — How It Works

1. **Pool discovery**: Calls `LP_SUGAR.forSwaps()` on-chain (paginated)
2. **Graph construction**: Builds a `graphology` multi-graph — nodes are tokens, edges are pools. Each pool creates two directed edges
3. **Path enumeration**: Uses `allSimpleEdgeGroupPaths` to find all paths from tokenA to tokenB, max 3 hops. Scoped by connector tokens (WETH, USDC, VELO, etc.) for efficiency
4. **On-chain quoting**: Each path quoted via `QuoterV2.quoteExactInput`, batched (50 paths/batch, 10 concurrent)
5. **Best quote selection**: Highest `amountOut`, filtering >100% price impact

The router handles mixed v2/Slipstream (CL) pools in a single route. Uses Universal Router for execution, not the legacy v2 Router.

### Maturity

- Alpha (0.3.0-alpha.3), UNLICENSED
- Last main commit: 2025-11-05, active development on other branches
- 3 GitHub stars
- Core routing primitives are battle-tested (extracted from production frontend)

---

## Comparison with Our Current VelodromeSwapProvider

| Capability | Our Implementation | Sugar SDK |
|-----------|-------------------|-----------|
| Hop count | Single-hop only | Multi-hop (up to 3) |
| Pool discovery | Manual `marketAllowlist` | Auto via `LP_SUGAR.forSwaps()` |
| Quoting | `Router.getAmountsOut` | `QuoterV2.quoteExactInput` |
| Pool types | v2 stable/volatile | v2 + Slipstream (CL) |
| Router | Legacy v2/leaf Router | Universal Router |
| Price impact | Hardcoded 0 | Computed from mid-price |
| Dependencies | viem only | wagmi + graphology |

---

## Integration Recommendations

### Do NOT use the SDK as a dependency

- UNLICENSED — legal risk
- Depends on `@wagmi/core` — we use raw viem
- Alpha quality wrapper
- Designed for wallet-connected dApps, not server-side agents

### Short term (this branch)

Keep the current single-hop + manual allowlist. It works for the demo and matches what we need for the Velodrome team review.

### Next iteration — Sugar for auto-discovery

Add Sugar contract addresses to `addresses.ts`. Call `forSwaps()` to dynamically discover all available pools. This is the highest-value, lowest-effort improvement:

- Eliminates manual `marketAllowlist` configuration
- Automatically supports new pools as they're created
- Works across all 12 chains

The `type` field in `SwapLp` maps directly to our `stable` flag: `-1` = stable, `1` = volatile.

### Later — Multi-hop routing

Extract the graph-based router from the SDK (~150 lines + `graphology` dep):

1. `buildGraph` — construct routing graph from Sugar pool data
2. `getPaths` — enumerate candidate paths via connector tokens
3. Integrate `QuoterV2` for accurate multi-hop quotes
4. Use Universal Router for execution

This replaces both the routing logic and the legacy Router. It's a larger change but unlocks significantly better pricing for users.

### Reference material

The SDK's `baseConfig` contains per-chain addresses for:
- Universal Router
- QuoterV2
- Sugar contracts
- Connector tokens (used to scope path finding)
- Unsafe token blacklists
- WETH addresses

These should be cross-referenced when expanding our address table.
