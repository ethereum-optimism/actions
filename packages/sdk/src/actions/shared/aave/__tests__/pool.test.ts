import { encodeFunctionData, zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  POOL_ABI,
  POOL_ACCOUNT_ABI,
  WETH_GATEWAY_ABI,
} from '@/actions/shared/aave/abis/pool.js'

describe('shared aave pool abi', () => {
  it('encodes a borrow call', () => {
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'borrow',
      args: [zeroAddress, 1n, 2n, 0, zeroAddress],
    })
    expect(data.startsWith('0x')).toBe(true)
  })

  it('encodes a repay call', () => {
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'repay',
      args: [zeroAddress, 1n, 2n, zeroAddress],
    })
    expect(data.startsWith('0x')).toBe(true)
  })

  it('encodes a getUserAccountData call', () => {
    const data = encodeFunctionData({
      abi: POOL_ACCOUNT_ABI,
      functionName: 'getUserAccountData',
      args: [zeroAddress],
    })
    expect(data.startsWith('0x')).toBe(true)
  })

  it('encodes a getReservesList call', () => {
    const data = encodeFunctionData({
      abi: POOL_ACCOUNT_ABI,
      functionName: 'getReservesList',
      args: [],
    })
    expect(data.startsWith('0x')).toBe(true)
  })

  it('exposes native borrow and repay gateway fragments', () => {
    expect(
      encodeFunctionData({
        abi: WETH_GATEWAY_ABI,
        functionName: 'borrowETH',
        args: [zeroAddress, 1n, 2n, 0],
      }).startsWith('0x'),
    ).toBe(true)
    expect(
      encodeFunctionData({
        abi: WETH_GATEWAY_ABI,
        functionName: 'repayETH',
        args: [zeroAddress, 1n, 2n, zeroAddress],
      }).startsWith('0x'),
    ).toBe(true)
  })
})
