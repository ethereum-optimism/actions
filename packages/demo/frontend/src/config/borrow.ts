/**
 * Borrow-tab configuration constants.
 *
 * `BORROW_HEALTH_BUFFER_PCT` is the fraction of LLTV the Borrow tab leaves
 * as a safety margin. The Health bar's 100% maps to
 * `LLTV * (1 - BORROW_HEALTH_BUFFER_PCT)` and the Max button prefills to
 * the same ceiling. Values outside [0, 1) throw at provider init via
 * `assertBufferValid`.
 *
 * TODO(actions config): when PR #3 lands, replace reads of this constant
 * with `actions.borrow.settings.healthBufferPct ?? 0.05`. Per-market
 * overrides will live on `BorrowMarketConfig.healthBufferPct`. Resolution
 * rule: `market.healthBufferPct ?? settings.healthBufferPct ?? 0.05`.
 */
export const BORROW_HEALTH_BUFFER_PCT = 0.05
