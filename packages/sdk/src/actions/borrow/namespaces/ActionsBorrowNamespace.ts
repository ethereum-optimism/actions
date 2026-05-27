import type { BaseBorrowNamespace } from '@/actions/borrow/namespaces/BaseBorrowNamespace.js'

/**
 * Read-only borrow namespace exposed on `actions.borrow`. Alias of
 * `BaseBorrowNamespace`; wallet methods live on `WalletBorrowNamespace`.
 */
export type ActionsBorrowNamespace = BaseBorrowNamespace
