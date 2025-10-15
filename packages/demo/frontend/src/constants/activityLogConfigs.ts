export type ActivityConfigEntry = {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet'
  action: string
  description: string
  isReadOnly?: boolean
}

/**
 * Activity configuration keyed by apiMethod
 * The apiMethod is the display string shown in the activity log (e.g., 'wallet.lend.openPosition()')
 */
export const ACTIVITY_CONFIG: Record<string, ActivityConfigEntry> = {
  'actions.lend.getMarkets()': {
    type: 'lend',
    action: 'getMarket',
    description: 'Get market',
    isReadOnly: true,
  },
  'wallet.lend.getPosition()': {
    type: 'lend',
    action: 'getPosition',
    description: 'Get position',
    isReadOnly: true,
  },
  'wallet.lend.openPosition()': {
    type: 'lend',
    action: 'deposit',
    description: 'Open lending position',
  },
  'wallet.lend.closePosition()': {
    type: 'withdraw',
    action: 'withdraw',
    description: 'Close lending position',
  },
  'wallet.fund()': {
    type: 'fund',
    action: 'mint',
    description: 'Mint demo USDC',
  },
  'wallet.getBalance()': {
    type: 'wallet',
    action: 'getBalance',
    description: 'Get wallet balance',
    isReadOnly: true,
  },
  'wallet.sendBatch()': {
    type: 'wallet',
    action: 'send',
    description: 'Send batch transaction',
  },
  'actions.wallet.createSmartWallet()': {
    type: 'wallet',
    action: 'create',
    description: 'Create smart wallet',
  },
}
