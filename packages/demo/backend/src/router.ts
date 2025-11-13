import { readFileSync } from 'fs'
import { Hono } from 'hono'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import * as lendController from './controllers/lend.js'
import { WalletController } from './controllers/wallet.js'
import { authMiddleware } from './middleware/auth.js'

export const router = new Hono()

const walletController = new WalletController()

// Get package.json path relative to this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJsonPath = join(__dirname, '../package.json')

router.get('/', (c) => {
  return c.text('OK')
})

router.get('/version', (c) => {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    return c.json({
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
    })
  } catch (error) {
    return c.json(
      {
        error: `Unable to read version info: ${error instanceof Error ? error.message : String(error)}`,
      },
      500,
    )
  }
})

router.get('/wallet/balance', authMiddleware, walletController.getBalance)
router.get(
  '/wallet/lend/:chainId/:marketAddress/position',
  authMiddleware,
  walletController.getLendPosition,
)
// Parameterized routes
router.get('/wallet', authMiddleware, walletController.getWallet)
router.post(
  '/wallet/usdc',
  authMiddleware,
  walletController.mintDemoUsdcToWallet,
)
router.post('/wallet/eth', walletController.dripEthToWallet)

// Lend endpoints
router.get('/lend/markets', lendController.getMarketsV1)
router.post('/lend/position/open', authMiddleware, lendController.openPosition)
router.post(
  '/lend/position/close',
  authMiddleware,
  lendController.closePosition,
)
