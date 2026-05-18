import { BaseBorrowNamespace } from '@/actions/borrow/namespaces/BaseBorrowNamespace.js'

/**
 * Read-only borrow namespace exposed on `actions.borrow`.
 * @description Inherits market/position queries from `BaseBorrowNamespace`;
 * intentionally empty subclass mirroring `ActionsLendNamespace`. Wallet
 * methods live on `WalletBorrowNamespace`.
 */
export class ActionsBorrowNamespace extends BaseBorrowNamespace {}
