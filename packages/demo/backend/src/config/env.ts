import 'dotenv/config'

import { cleanEnv, port, str } from 'envalid'

export const env = cleanEnv(process.env, {
  PORT: port({ default: 3000 }),
  PRIVY_APP_ID: str({ devDefault: 'dummy' }),
  PRIVY_APP_SECRET: str({ devDefault: 'dummy' }),
  RPC_URL: str({ default: 'http://127.0.0.1:9545' }),
  FAUCET_ADMIN_PRIVATE_KEY: str({
    default:
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  }),
  FAUCET_ADDRESS: str({
    default: '0xA8b0621be8F2feadEaFb3d2ff477daCf38bFC2a8',
  }),
})
