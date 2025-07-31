import { readFileSync } from 'fs'
import { Hono } from 'hono'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { LendController } from './controllers/lend.js'
import { WalletController } from './controllers/wallet.js'

export const router = new Hono()

const walletController = new WalletController()
const lendController = new LendController()

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

router.get('/wallets', walletController.getAllWallets)
router.post('/wallet/:userId', walletController.createWallet)
router.get('/wallet/:userId', walletController.getWallet)
router.get('/wallet/:userId/balance', walletController.getBalance)
router.post('/wallet/:userId/fund', walletController.fundWallet)

// Lend endpoints
router.get('/lend/vaults', lendController.getVaults)
router.get('/lend/vault/:vaultAddress', lendController.getVault)
