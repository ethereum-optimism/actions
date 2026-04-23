import { baseContext } from '@/context/baseContext.js'
import { writeJson } from '@/output/json.js'

/**
 * @description Handler for `actions assets`. Returns the configured
 * allowlist of assets as a JSON array on stdout. Read-only — no signer
 * needed.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runAssets(): Promise<void> {
  const { actions } = baseContext()
  writeJson(actions.getSupportedAssets())
}
