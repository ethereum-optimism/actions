# @eth-optimism/actions-demo-contracts

## 0.1.0

### Minor Changes

- [#311](https://github.com/ethereum-optimism/actions/pull/311) [`a1dd54c`](https://github.com/ethereum-optimism/actions/commit/a1dd54c3401dfda4309768f8cb6b11521fe683f0) Thanks [@its-everdred](https://github.com/its-everdred)! - - Add Velodrome/Aerodrome swap provider with v2 AMM and CL/Slipstream pool support across 12 OP Stack chains.
  - Refactor swap interface with flat SwapQuote type, multi-provider quoting (getQuotes, getBestQuote), and SwapSettings configuration.
  - Extract shared ERC20 approval utilities.
