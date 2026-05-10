import {
  ETH,
  type NodeActionsConfig,
  OP_DEMO,
  USDC_DEMO,
} from '@eth-optimism/actions-sdk'

import { getDemoChains } from '@/demo/chains.js'
import { AaveETH, GauntletUSDCDemo } from '@/demo/markets.js'

/**
 * @description Returns the baked demo `NodeActionsConfig` the CLI boots
 * against. Mirrors `packages/demo/backend/src/config/actions.ts` in
 * asset, lend, and swap allowlists so CLI behaviour stays aligned with
 * the demo backend. Divergences: `hostedWalletConfig` is omitted (the
 * CLI uses an EOA-backed wallet via
 * `actions.wallet.toActionsWallet(localAccount)`); chain bundlers are
 * omitted (no ERC-4337 gas abstraction - the signer pays gas directly).
 * @returns `NodeActionsConfig` with no hosted wallet provider configured.
 */
export function getDemoConfig(): NodeActionsConfig<never> {
  return {
    wallet: {
      smartWalletConfig: {
        provider: { type: 'default', attributionSuffix: 'actions' },
      },
    },
    lend: {
      morpho: { marketAllowlist: [GauntletUSDCDemo] },
      aave: { marketAllowlist: [AaveETH] },
    },
    swap: {
      uniswap: {
        defaultSlippage: 0.005,
        marketAllowlist: [
          { assets: [USDC_DEMO, OP_DEMO], fee: 100, tickSpacing: 2 },
        ],
      },
      velodrome: {
        defaultSlippage: 0.005,
        marketAllowlist: [{ assets: [USDC_DEMO, OP_DEMO], stable: false }],
      },
    },
    assets: { allow: [USDC_DEMO, OP_DEMO, ETH] },
    chains: getDemoChains(),
  }
}
