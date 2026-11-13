---
'@eth-optimism/actions-sdk': minor
---

Standardize provider contract address storage on `{ contracts, metadata }` and validate it through `contractAddresses()`.

- Uniswap, Aave, and Morpho chain configs now match the Velodrome shape. Address getters still return the `contracts` object, so existing call sites are unchanged.
- `BaseActionProvider.contractAddresses()` is abstract. Every lend, swap, and borrow provider must report the addresses it deploys. Subclasses written outside this package need to implement the method.
- Address tests instantiate the registered providers and check `contractAddresses()` instead of importing each address map.
- Remove the redundant Aave `POOL_ADDRESSES_*` and `WETH_GATEWAY_ADDRESSES_*` maps. Pool and gateway addresses now live only on the shared chain config.
