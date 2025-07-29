/**
 * Test utilities for the Verbs SDK
 */

/**
 * Helper function to check if external tests should run
 * External tests make real network requests and are only run when EXTERNAL_TEST=true
 *
 * Usage:
 * ```typescript
 * import { externalTest } from '../utils/test.js'
 *
 * it.runIf(externalTest())('should make real API request', async () => {
 *   // Test that makes actual network calls
 * })
 * ```
 */
export const externalTest = () => process.env.EXTERNAL_TEST === 'true'
