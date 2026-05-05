import {
  ETH,
  type NodeActionsConfig,
  OP_DEMO,
  USDC_DEMO,
} from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia } from 'viem/chains'

import { getDemoChains } from '@/demo/chains.js'
import { AaveETH, GauntletUSDCDemo } from '@/demo/markets.js'

const DEMO_TESTNET_IDS = new Set<number>([baseSepolia.id, optimismSepolia.id])

function assertTestnetOnly(chains: Array<{ chainId: number }>): void {
  for (const { chainId } of chains) {
    if (!DEMO_TESTNET_IDS.has(chainId)) {
      throw new Error(
        `getDemoConfig() refuses to configure non-testnet chain ${chainId}: ` +
          `demo defaults (approvalMode: 'max') would grant infinite approvals ` +
          `on a production chain. Drop settings.approvalMode or build a ` +
          `production NodeActionsConfig directly.`,
      )
    }
  }
}

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
  const chains = getDemoChains()
  assertTestnetOnly(chains)
  return {
    wallet: {
      smartWalletConfig: {
        provider: { type: 'default', attributionSuffix: 'actions' },
      },
    },
    lend: {
      morpho: { marketAllowlist: [GauntletUSDCDemo] },
      aave: { marketAllowlist: [AaveETH] },
      // Demo CLI opts into infinite approvals so repeat lend/swap calls
      // skip Permit2 + ERC-20 approval txs. Testnet-only by construction
      // (assertTestnetOnly above). For production NodeActionsConfig, leave
      // approvalMode at the SDK default ('exact').
      settings: { approvalMode: 'max' },
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
      // See lend.settings note above. Velodrome's max-approval path is
      // direct ERC-20 to the universal router (no Permit2 expiration), so
      // this default is especially important to leave testnet-scoped.
      settings: { approvalMode: 'max' },
    },
    assets: { allow: [USDC_DEMO, OP_DEMO, ETH] },
    chains,
  }
}
