---
'@eth-optimism/actions-sdk': patch
---

Clamp swap slippage validation to finite values in [0, 1) and reuse
provider-derived slippage bounds when encoding Uniswap calldata.
