---
'@eth-optimism/actions-sdk': patch
---

Allow Ethereum L1 chains (mainnet, sepolia) in `ChainManager`.

`ChainManager` resolved chain objects exclusively through `chainById` from
`@eth-optimism/viem/chains`, a Superchain-only registry that omits Ethereum
mainnet (chain 1) and sepolia. Configuring either chain threw
`ChainNotSupportedError`, which made operator-trusted ENS reads (which run on
mainnet) impossible. `ChainManager` now falls back to viem's own L1 chain
definitions for these ids via the new exported `viemChainFor` helper.
`getChain` throws `ChainNotSupportedError` for an unresolvable id instead of
returning `undefined`.
