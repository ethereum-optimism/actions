/**
 * @description Keeps the wallet surface visually stable while provider state is restored.
 * @returns A blank wallet loading surface.
 */
export function WalletLoadingScreen() {
  return <div className="min-h-screen bg-white" aria-busy="true" />
}
