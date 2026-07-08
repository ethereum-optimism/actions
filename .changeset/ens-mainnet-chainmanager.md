---
'@eth-optimism/actions-sdk': minor
---

Allow Ethereum L1 chains (mainnet, sepolia) in `ChainManager`.

`ChainManager` resolved chain objects exclusively through `chainById` from
`@eth-optimism/viem/chains`, a Superchain-only registry that omits Ethereum
mainnet (chain 1) and sepolia. Configuring either chain threw
`ChainNotSupportedError`, which made operator-trusted ENS reads (which run on
mainnet) impossible. `ChainManager` now resolves chain definitions from the
SDK supported-chain registry, which already includes Ethereum L1 chains.
`getChain` throws `ChainNotSupportedError` for an unresolvable id instead of
returning `undefined`.
