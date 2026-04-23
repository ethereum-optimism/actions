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
 * against. Mirrors `packages/demo/backend/src/config/actions.ts` in asset
 * and market set, so CLI behaviour stays aligned with the demo backend
 * end-to-end. Divergences are intentional and narrow:
 *
 * - `hostedWalletConfig` is omitted. The CLI derives a viem `LocalAccount`
 *   from `PRIVATE_KEY` and passes it to `actions.wallet.toActionsWallet()`,
 *   producing an EOA-backed wallet. No Privy, no hosted signer.
 * - `swap` is omitted entirely. `SwapConfig` requires at least one provider
 *   key, so `swap: {}` is a type error; leaving the field off makes
 *   `actions.swap` surface a "not configured" message on access. PR 3 wires
 *   real swap providers.
 * - `chains` carry no bundler configuration. Transactions go out as
 *   standard EOA sends — no ERC-4337 gas abstraction for now.
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
    assets: { allow: [USDC_DEMO, OP_DEMO, ETH] },
    chains: getDemoChains(),
  }
}
