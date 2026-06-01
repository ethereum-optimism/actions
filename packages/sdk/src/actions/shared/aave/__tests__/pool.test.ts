import { decodeFunctionData, encodeFunctionData, getAddress } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  POOL_ABI,
  POOL_ACCOUNT_ABI,
  WETH_GATEWAY_ABI,
} from '@/actions/shared/aave/abis/pool.js'

// Checksummed so they match the addresses viem returns from decodeFunctionData.
const ASSET = getAddress('0x00000000000000000000000000000000000a55e7')
const USER = getAddress('0x000000000000000000000000000000000000beef')

describe('shared aave pool abi', () => {
  it('round-trips a borrow call with its args', () => {
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'borrow',
      args: [ASSET, 1000n, 2n, 0, USER],
    })
    const decoded = decodeFunctionData({ abi: POOL_ABI, data })
    expect(decoded.functionName).toBe('borrow')
    expect(decoded.args).toEqual([ASSET, 1000n, 2n, 0, USER])
  })

  it('round-trips a repay call with its args', () => {
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'repay',
      args: [ASSET, 1000n, 2n, USER],
    })
    const decoded = decodeFunctionData({ abi: POOL_ABI, data })
    expect(decoded.functionName).toBe('repay')
    expect(decoded.args).toEqual([ASSET, 1000n, 2n, USER])
  })

  it('round-trips getUserAccountData and getReservesList', () => {
    const accountData = decodeFunctionData({
      abi: POOL_ACCOUNT_ABI,
      data: encodeFunctionData({
        abi: POOL_ACCOUNT_ABI,
        functionName: 'getUserAccountData',
        args: [USER],
      }),
    })
    expect(accountData.functionName).toBe('getUserAccountData')
    expect(accountData.args).toEqual([USER])

    const reservesList = decodeFunctionData({
      abi: POOL_ACCOUNT_ABI,
      data: encodeFunctionData({
        abi: POOL_ACCOUNT_ABI,
        functionName: 'getReservesList',
        args: [],
      }),
    })
    expect(reservesList.functionName).toBe('getReservesList')
  })

  it('round-trips native borrow and repay gateway fragments', () => {
    const borrow = decodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      data: encodeFunctionData({
        abi: WETH_GATEWAY_ABI,
        functionName: 'borrowETH',
        args: [ASSET, 1000n, 2n, 0],
      }),
    })
    expect(borrow.functionName).toBe('borrowETH')
    expect(borrow.args).toEqual([ASSET, 1000n, 2n, 0])

    const repay = decodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      data: encodeFunctionData({
        abi: WETH_GATEWAY_ABI,
        functionName: 'repayETH',
        args: [ASSET, 1000n, 2n, USER],
      }),
    })
    expect(repay.functionName).toBe('repayETH')
    expect(repay.args).toEqual([ASSET, 1000n, 2n, USER])
  })
})
