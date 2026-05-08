---
'@eth-optimism/actions-sdk': minor
---

Perf: cut EOA swap dispatch wall-time on fast L2s.

- `EOAWallet.sendBatch` no longer waits for `confirmations: 2` between sub-txs.
  One inclusion wait per tx is enough now that `EOAWallet.walletClient` attaches
  viem's default `nonceManager` to the signer, which keeps nonces sequential
  locally instead of relying on `eth_getTransactionCount('pending')` on every
  send (avoids races on load-balanced RPCs).
- `ChainManager` now defaults the viem `pollingInterval` per chain class:
  1000ms for L2-class chains (~1-2s blocks) and 4000ms for L1 mainnet/sepolia
  (~12s blocks). Saves ~3 RPC poll cycles per receipt wait on Base/OP/Unichain.
  This default applies to the public client used by `getPublicClient()` and to
  the public client wrapping the simple bundler client. There is no override
  knob; if a real consumer needs one we'll add it then.

Behavioural notes for consumers:

- `sendBatch` is sequential and assumes a sequencer-ordered chain (e.g.
  OP-stack L2s). On reorg-heavy chains, callers should consider an additional
  confirmations pass at the call site.
- The Velodrome swap path uses **direct ERC-20 max approval** to its universal
  router when `approvalMode: 'max'` is requested — there is no Permit2
  intermediary as on Uniswap. The full allowance persists at the router until
  manually revoked. Continue to scope `approvalMode: 'max'` to demo/testnet
  paths.
