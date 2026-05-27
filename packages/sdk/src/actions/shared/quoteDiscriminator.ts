/**
 * Property name used to distinguish a fully-built quote (`*Quote`) from
 * raw execute params at the wallet namespace boundary.
 * @description Every domain that ships a quote/commit pattern (swap,
 * borrow, …) sets `quotedAt` on the quote. The wallet namespace tests
 * `QUOTE_DISCRIMINATOR in params` to route between dispatching the
 * pre-built bundle and re-quoting from raw params.
 */
export const QUOTE_DISCRIMINATOR = 'quotedAt' as const
