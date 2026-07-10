export type ActivityConfigEntry = {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet' | 'swap' | 'borrow' | 'repay'
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
    description: 'Mint asset',
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
  getPrice: {
    type: 'swap',
    description: 'Get price',
    apiMethod: 'actions.swap.getQuote()',
    tooltip: 'Fetches a swap price quote',
    isReadOnly: true,
  },
  swap: {
    type: 'swap',
    description: 'Swap tokens',
    apiMethod: 'wallet.swap.execute()',
    tooltip: 'Swaps tokens via DEX',
  },
  borrow: {
    type: 'borrow',
    description: 'Open borrow position',
    apiMethod: 'wallet.borrow.openPosition()',
    tooltip: 'Opens a new borrow position against collateral',
  },
  repay: {
    type: 'repay',
    description: 'Repay borrowed amount',
    apiMethod: 'wallet.borrow.repay()',
    tooltip: 'Reduces an existing borrow position',
  },
  closePosition: {
    type: 'borrow',
    description: 'Close borrow position',
    apiMethod: 'wallet.borrow.closePosition()',
    tooltip: 'Repays the full debt and withdraws all collateral',
  },
  depositCollateral: {
    type: 'borrow',
    description: 'Deposit collateral',
    apiMethod: 'wallet.borrow.depositCollateral()',
    tooltip: 'Adds collateral to an existing borrow position',
  },
  withdrawCollateral: {
    type: 'borrow',
    description: 'Withdraw collateral',
    apiMethod: 'wallet.borrow.withdrawCollateral()',
    tooltip: 'Releases collateral from an existing borrow position',
  },
  getBorrowMarkets: {
    type: 'borrow',
    description: 'Get borrow markets',
    apiMethod: 'actions.borrow.getMarkets()',
    tooltip: 'Fetches available borrow markets',
    isReadOnly: true,
  },
  getBorrowPosition: {
    type: 'borrow',
    description: 'Get borrow position',
    apiMethod: 'actions.borrow.getPosition()',
    tooltip: "Returns a wallet's borrow positions",
    isReadOnly: true,
  },
}
