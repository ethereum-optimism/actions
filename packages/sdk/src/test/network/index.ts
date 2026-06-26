/**
 * Consolidated Anvil fork-test harness, the single foundation all network
 * fork tests build on: ephemeral-port forks with `chainId`-validated
 * readiness, a real `ChainManager` bound to the fork RPC, and fail-loud
 * per-chain wallet funding.
 */
export { type AnvilFork, startAnvilFork, stopAnvilFork } from './anvil.js'
export { createForkChainManager } from './chainManager.js'
export { fundWallet, type FundWalletConfig } from './funding.js'
