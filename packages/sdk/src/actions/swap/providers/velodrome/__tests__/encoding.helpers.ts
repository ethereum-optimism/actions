import type { Address } from 'viem'
import { decodeFunctionData } from 'viem'
import { base, optimism } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

export const OP_CHAIN_ID = optimism.id as SupportedChainId
export const BASE_CHAIN_ID = base.id as SupportedChainId
export const RECIPIENT = '0x000000000000000000000000000000000000dEaD' as Address
export const FACTORY = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a' as Address
export const DEADLINE = Math.floor(Date.now() / 1000) + 60

/** Decode calldata and extract args without readonly tuple noise */
export function decode<T extends readonly unknown[]>(
  abi: Parameters<typeof decodeFunctionData>[0]['abi'],
  data: `0x${string}`,
) {
  const result = decodeFunctionData({ abi, data })
  return { functionName: result.functionName, args: result.args as T }
}
