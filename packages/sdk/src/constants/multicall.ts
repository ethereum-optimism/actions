import type { Abi, Address } from 'viem'

/**
 * Canonical Multicall3 deployment address. Multicall3 is deployed at this same
 * address on every OP Stack chain and most other EVM chains.
 * @see https://github.com/mds1/multicall
 */
export const MULTICALL3_ADDRESS: Address =
  '0xcA11bde05977b3631167028862bE2a173976CA11'

/**
 * Minimal Multicall3 ABI fragment exposing `getEthBalance`.
 * @description viem's exported `multicall3Abi` only carries `aggregate3` (the
 * entry point it uses internally), so we declare `getEthBalance` here to read a
 * wallet's native balance inside the same batched `eth_call` as the ERC-20
 * `balanceOf` reads.
 */
export const multicall3GetEthBalanceAbi = [
  {
    type: 'function',
    stateMutability: 'view',
    name: 'getEthBalance',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const satisfies Abi
