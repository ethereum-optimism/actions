/**
 * Borrow API client.
 *
 * Thin HTTP layer over the demo backend's `/borrow/*` and
 * `/wallet/borrow/*` routes. Extends `BaseApiClient` for the shared
 * timeout-aware `request<T>` helper; per method takes `headers?:
 * HeadersInit` for auth. Param shapes live in `./borrowApi.types`; body
 * builders, deserializers, and URL helpers live in `./borrowApi.serializers`.
 */

import type { Address } from 'viem'
import type {
  BorrowMarket,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowQuote,
  BorrowReceipt,
} from '@eth-optimism/actions-sdk'
import { serializeBigInt } from '@eth-optimism/actions-sdk'

import type { Serialized } from '../util/serialize.js'
import { BaseApiClient, MUTATION_TIMEOUT_MS } from './apiClient.js'
import {
  buildQuoteBody,
  deserializeMarket,
  deserializePosition,
  deserializeQuote,
  deserializeReceipt,
  isEmptyPosition,
  marketIdPath,
} from './borrowApi.serializers.js'
import type {
  BorrowQuoteParams,
  StubCloseParams,
  StubCollateralParams,
  StubOpenParams,
  StubRepayParams,
} from './borrowApi.types.js'

export type {
  BorrowQuoteParams,
  StubCloseParams,
  StubCollateralParams,
  StubOpenParams,
  StubRepayParams,
} from './borrowApi.types.js'

export class BorrowApiClient extends BaseApiClient {
  async getMarkets(
    headers: HeadersInit = {},
  ): Promise<readonly BorrowMarket[]> {
    const { result } = await this.request<{
      result: Serialized<BorrowMarket>[]
    }>('/borrow/markets', { method: 'GET', headers })
    return result.map(deserializeMarket)
  }

  async getPosition(
    _walletAddress: Address,
    marketId: BorrowMarketId,
    headers: HeadersInit = {},
  ): Promise<BorrowMarketPosition | null> {
    const { result } = await this.request<{
      result: Serialized<BorrowMarketPosition>
    }>(`/wallet/borrow/${marketIdPath(marketId)}/position`, {
      method: 'GET',
      headers,
    })
    const position = deserializePosition(result)
    return isEmptyPosition(position) ? null : position
  }

  async getPositions(
    walletAddress: Address,
    headers: HeadersInit = {},
  ): Promise<readonly BorrowMarketPosition[]> {
    // Backend has no list endpoint; fan out across known markets and
    // drop the zero-position responses.
    const markets = await this.getMarkets(headers)
    const positions = await Promise.all(
      markets.map((m) => this.getPosition(walletAddress, m.marketId, headers)),
    )
    return positions.filter((p): p is BorrowMarketPosition => p !== null)
  }

  async getQuote(
    params: BorrowQuoteParams,
    headers: HeadersInit = {},
  ): Promise<BorrowQuote> {
    const body = serializeBigInt(buildQuoteBody(params))
    const { result } = await this.request<{ result: Serialized<BorrowQuote> }>(
      '/borrow/quote',
      { method: 'POST', body: JSON.stringify(body), headers },
    )
    return deserializeQuote(result)
  }

  async openPosition(
    _walletAddress: Address,
    params: StubOpenParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation('/borrow/position/open', params, headers)
  }

  async closePosition(
    _walletAddress: Address,
    params: StubCloseParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation('/borrow/position/close', params, headers)
  }

  async depositCollateral(
    _walletAddress: Address,
    params: StubCollateralParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation(
      '/borrow/position/deposit-collateral',
      params,
      headers,
    )
  }

  async withdrawCollateral(
    _walletAddress: Address,
    params: StubCollateralParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation(
      '/borrow/position/withdraw-collateral',
      params,
      headers,
    )
  }

  async repay(
    _walletAddress: Address,
    params: StubRepayParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation('/borrow/position/repay', params, headers)
  }

  private async postMutation(
    endpoint: string,
    params: object,
    headers: HeadersInit,
  ): Promise<BorrowReceipt> {
    const body = serializeBigInt(params)
    const { result } = await this.request<{
      result: Serialized<BorrowReceipt>
    }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
      timeoutMs: MUTATION_TIMEOUT_MS,
    })
    return deserializeReceipt(result)
  }
}

export const borrowApi = new BorrowApiClient()
