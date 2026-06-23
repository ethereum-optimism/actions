import { readFileSync } from 'fs'
import { Hono } from 'hono'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import * as assetsController from './controllers/assets.js'
import * as borrowController from './controllers/borrow.js'
import * as lendController from './controllers/lend.js'
import * as swapController from './controllers/swap.js'
import { WalletController } from './controllers/wallet.js'
import { authMiddleware } from './middleware/auth.js'
import { rateLimit } from './middleware/rateLimit.js'

export const router = new Hono()

const walletController = new WalletController()
const AUTH_RATE_LIMIT_WINDOW_MS = 60_000
const AUTH_RATE_LIMIT_MAX = 10
const authRateLimit = () =>
  rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
  })

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
  authRateLimit(),
  walletController.mintDemoUsdcToWallet,
)
router.post(
  '/wallet/eth',
  authMiddleware,
  authRateLimit(),
  walletController.dripEthToWallet,
)

// Lend endpoints
router.get('/lend/markets', lendController.getMarkets)
router.post(
  '/lend/position/open',
  authMiddleware,
  authRateLimit(),
  lendController.openPosition,
)
router.post(
  '/lend/position/close',
  authMiddleware,
  authRateLimit(),
  lendController.closePosition,
)

// Borrow endpoints
router.get('/borrow/markets', borrowController.getMarkets)
router.post('/borrow/quote', authMiddleware, borrowController.getQuote)
router.get(
  '/wallet/borrow/:chainId/:marketId/position',
  authMiddleware,
  walletController.getBorrowPosition,
)
router.post(
  '/borrow/position/open',
  authMiddleware,
  authRateLimit(),
  borrowController.openPosition,
)
router.post(
  '/borrow/position/close',
  authMiddleware,
  authRateLimit(),
  borrowController.closePosition,
)
router.post(
  '/borrow/position/deposit-collateral',
  authMiddleware,
  authRateLimit(),
  borrowController.depositCollateral,
)
router.post(
  '/borrow/position/withdraw-collateral',
  authMiddleware,
  authRateLimit(),
  borrowController.withdrawCollateral,
)
router.post(
  '/borrow/position/repay',
  authMiddleware,
  authRateLimit(),
  borrowController.repay,
)

// Assets endpoints
router.get('/assets', assetsController.getAssets)

// Swap endpoints
router.get('/swap/markets', swapController.getMarkets)
router.get('/swap/quote', swapController.getQuote)
router.post(
  '/swap/execute',
  authMiddleware,
  authRateLimit(),
  swapController.executeSwap,
)
