import { usePrivy, useWallets } from '@privy-io/react-auth'

export function usePrivyWallet() {
  const { authenticated, ready, user } = usePrivy()
  const { wallets } = useWallets()

  const getConnectedWallet = () => {
    if (!authenticated || !ready) return null
    
    const wallet = wallets[0]
    return wallet?.address || null
  }

  const getUserEmail = () => {
    if (!authenticated || !ready) return null
    return user?.email?.address || null
  }

  return {
    authenticated,
    ready,
    walletAddress: getConnectedWallet(),
    userEmail: getUserEmail(),
    user,
  }
}