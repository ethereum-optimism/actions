/**
 * Cross-domain default values shared by per-action providers when neither
 * provider config nor shared settings sets a value.
 */

/**
 * Default quote expiration in seconds.
 * @description Used by borrow and swap providers. Conservative window
 * chosen because borrow quotes depend on two oracle prices and swap
 * quotes depend on pool state, both of which can drift quickly.
 * Consumers can extend the window per-domain via
 * `borrow.settings.quoteExpirationSeconds` or
 * `swap.settings.quoteExpirationSeconds`.
 */
export const DEFAULT_QUOTE_EXPIRATION_SECONDS = 30
