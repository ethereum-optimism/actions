import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  type Hex,
  isAddress,
  isHex,
} from 'viem'

import {
  EXACT_INPUT_SINGLE_PARAMS,
  EXACT_OUTPUT_SINGLE_PARAMS,
  TAKE_PARAMS,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/uniswap/abis.js'

export const isReadonlyArray = (value: unknown): value is readonly unknown[] =>
  Array.isArray(value)

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function expectHex(value: unknown, label: string): Hex {
  if (!isHex(value)) throw new Error(`${label} is not hex`)
  return value
}

export function expectBigInt(value: unknown, label: string): bigint {
  if (typeof value !== 'bigint') throw new Error(`${label} is not bigint`)
  return value
}

export function expectAddress(value: unknown, label: string): Address {
  if (typeof value !== 'string' || !isAddress(value)) {
    throw new Error(`${label} is not an address`)
  }
  return value
}

export function decodeRouterInput(calldata: Hex): Hex {
  const { functionName, args } = decodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    data: calldata,
  })
  if (functionName !== 'execute') throw new Error('router call is not execute')
  if (!isReadonlyArray(args) || !isReadonlyArray(args[1])) {
    throw new Error('execute args are malformed')
  }
  return expectHex(args[1][0], 'router input')
}

export function decodeV4SwapParams(calldata: Hex): readonly unknown[] {
  const [, swapParams] = decodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    decodeRouterInput(calldata),
  )
  if (!isReadonlyArray(swapParams)) {
    throw new Error('V4 swap params are malformed')
  }
  return swapParams
}

export function decodeMinAmountOut(calldata: Hex): bigint {
  const [swap] = decodeAbiParameters(
    EXACT_INPUT_SINGLE_PARAMS,
    expectHex(decodeV4SwapParams(calldata)[0], 'exact-in params'),
  )
  if (!isRecord(swap)) throw new Error('exact-in swap is malformed')
  return expectBigInt(swap.amountOutMinimum, 'amountOutMinimum')
}

export function decodeMaxAmountIn(calldata: Hex): bigint {
  const [swap] = decodeAbiParameters(
    EXACT_OUTPUT_SINGLE_PARAMS,
    expectHex(decodeV4SwapParams(calldata)[0], 'exact-out params'),
  )
  if (!isRecord(swap)) throw new Error('exact-out swap is malformed')
  return expectBigInt(swap.amountInMaximum, 'amountInMaximum')
}

export function decodeTakeParams(calldata: Hex): {
  currency: Address
  recipient: Address
  amount: bigint
} {
  const [currency, recipient, amount] = decodeAbiParameters(
    TAKE_PARAMS,
    expectHex(decodeV4SwapParams(calldata)[2], 'take params'),
  )

  return {
    currency: expectAddress(currency, 'take currency'),
    recipient: expectAddress(recipient, 'take recipient'),
    amount: expectBigInt(amount, 'take amount'),
  }
}
