import { baseContext } from '@/context/baseContext.js'
import { printOutput } from '@/output/printOutput.js'

/**
 * @description Handler for `actions assets`. Emits the configured
 * allowlist of assets (JSON or human-readable, per `--json`).
 * Read-only, no signer needed.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runAssets(): Promise<void> {
  const { actions } = baseContext()
  printOutput('assets', actions.getSupportedAssets())
}
