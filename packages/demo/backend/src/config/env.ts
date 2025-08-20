import 'dotenv/config'

import { bool, cleanEnv, port, str } from 'envalid'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getAddress, isAddress } from 'viem'
import { z } from 'zod'

const FaucetConfigSchema = z.object({
  faucetAddress: z
    .string()
    .refine(isAddress, { message: 'Invalid address' })
    .transform((val) => getAddress(val)),
})

const DEFAULT_FAUCET_ADDRESS =
  '0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8' as const

function getFaucetAddressDefault() {
  const isLocalDev = bool()._parse(process.env.LOCAL_DEV || 'false')
  if (!isLocalDev) return DEFAULT_FAUCET_ADDRESS

  try {
    const configPath = join(
      process.cwd(),
      '../../../latest-faucet-deployment.json',
    )
    const configFile = readFileSync(configPath, 'utf8')
    const { faucetAddress } = FaucetConfigSchema.parse(JSON.parse(configFile))
    return faucetAddress
  } catch (error) {
    console.warn(
      'Could not read latest-faucet-deployment.json, using fallback address',
      error,
    )
    return DEFAULT_FAUCET_ADDRESS
  }
}

export const env = cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
  PRIVY_APP_ID: str({ devDefault: 'dummy' }),
  PRIVY_APP_SECRET: str({ devDefault: 'dummy' }),
  LOCAL_DEV: bool({ default: false }),
  RPC_URL: str({ default: 'http://127.0.0.1:9545' }),
  FAUCET_ADMIN_PRIVATE_KEY: str({
    default:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  }),
  FAUCET_ADDRESS: str({ default: getFaucetAddressDefault() }),
})
