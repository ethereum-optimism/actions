export type ActivityConfigEntry = {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet'
  description: string
  apiMethod: string
  tooltip: string
  isReadOnly?: boolean
}

/**
 * Activity configuration keyed by short action name
 */
export const ACTIVITY_CONFIG: Record<string, ActivityConfigEntry> = {
  getMarket: {
    type: 'lend',
    description: 'Get market',
    apiMethod: 'actions.lend.getMarket()',
    tooltip: 'Fetches available lending markets',
    isReadOnly: true,
  },
  getPosition: {
    type: 'lend',
    description: 'Get position',
    apiMethod: 'wallet.lend.getPosition()',
    tooltip: "Returns a wallet's market positions",
    isReadOnly: true,
  },
  deposit: {
    type: 'lend',
    description: 'Open lending position',
    apiMethod: 'wallet.lend.openPosition()',
    tooltip: 'Opens a new lending position',
  },
  withdraw: {
    type: 'withdraw',
    description: 'Close lending position',
    apiMethod: 'wallet.lend.closePosition()',
    tooltip: 'Closes an existing lending position',
  },
  mint: {
    type: 'fund',
    description: 'Mint USDC',
    apiMethod: 'Demo Action',
    tooltip: 'Funds a wallet with demo tokens',
  },
  getBalance: {
    type: 'wallet',
    description: 'Get balance',
    apiMethod: 'wallet.getBalance()',
    tooltip: 'Retrieves wallet token balances',
    isReadOnly: true,
  },
  send: {
    type: 'wallet',
    description: 'Send batch transaction',
    apiMethod: 'wallet.sendTokens()',
    tooltip: 'Transfers tokens to another address',
  },
  create: {
    type: 'wallet',
    description: 'Create smart wallet',
    apiMethod: 'actions.wallet.createSmartWallet()',
    tooltip: 'Creates a new smart wallet',
  },
}
