import { getActions } from '@/config/actions.js'
import {
  asActionsBorrow,
  type BorrowMarket,
  type GetBorrowMarketsParams,
} from '@/types/borrow-sdk-stubs.js'

export async function getMarkets(
  params: GetBorrowMarketsParams = {},
): Promise<BorrowMarket[]> {
  const actions = getActions()
  return await asActionsBorrow(actions).getMarkets(params)
}
