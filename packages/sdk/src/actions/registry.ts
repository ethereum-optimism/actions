import { borrowModule } from '@/actions/borrow/module.js'
import { lendModule } from '@/actions/lend/module.js'
import type { ActionModule } from '@/actions/shared/ActionModule.js'
import { swapModule } from '@/actions/swap/module.js'
import type { ActionName } from '@/types/actionRegistry.js'

/**
 * Central registry of every action the SDK ships.
 * @description `Actions` and `Wallet` iterate this map to construct
 * providers and namespaces. Add a new action by importing its module
 * here — no edits to wallet/provider plumbing required.
 */
export const ACTION_MODULES = {
  lend: lendModule,
  swap: swapModule,
  borrow: borrowModule,
} as const satisfies { [K in ActionName]: ActionModule<K> }

/** Keys of `ACTION_MODULES` in registration order. */
export const ACTION_NAMES = Object.keys(ACTION_MODULES) as readonly ActionName[]
