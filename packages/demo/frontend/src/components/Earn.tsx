import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  usePrivy,
  useLogin,
  useLogout,
  useUser,
  useSessionSigners,
  type WalletWithMetadata,
} from '@privy-io/react-auth'
import Info from './Info'
import Action from './Action'
import LentBalance from './LentBalance'
import ActivityLog from './ActivityLog'
import { ActivityLogProvider } from '../contexts/ActivityLogContext'
import { useLoggedActionsApi } from '../hooks/useLoggedActionsApi'
import { env } from '../envVars'

function EarnContent() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const { login } = useLogin()
  const { logout } = useLogout()
  const { user } = useUser()
  const { addSessionSigners } = useSessionSigners()
  const loggedApi = useLoggedActionsApi()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [usdcBalance, setUsdcBalance] = useState<string>('0')
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [walletCreated, setWalletCreated] = useState(false)
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null)
  const [apy, setApy] = useState<number | null>(null)
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const [isLoadingApy, setIsLoadingApy] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  const ethereumEmbeddedWallets = useMemo<WalletWithMetadata[]>(
    () =>
      (user?.linkedAccounts?.filter(
        (account) =>
          account.type === 'wallet' &&
          account.walletClientType === 'privy' &&
          account.chainType === 'ethereum',
      ) as WalletWithMetadata[]) ?? [],
    [user],
  )

  const getAuthHeaders = useCallback(async () => {
    const token = await getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : undefined
  }, [getAccessToken])

  const addSessionSigner = useCallback(
    async (walletAddress: string) => {
      if (!env.VITE_SESSION_SIGNER_ID) {
        console.error('SESSION_SIGNER_ID must be defined to addSessionSigner')
        return
      }

      try {
        await addSessionSigners({
          address: walletAddress,
          signers: [
            {
              signerId: env.VITE_SESSION_SIGNER_ID,
            },
          ],
        })
        console.log('Session signer added for wallet:', walletAddress)
      } catch (error) {
        console.error('Error adding session signer:', error)
      }
    },
    [addSessionSigners],
  )

  // Add session signers for undelegated wallets
  useEffect(() => {
    const undelegatedEthereumEmbeddedWallets = ethereumEmbeddedWallets.filter(
      (wallet) => wallet.delegated !== true,
    )
    undelegatedEthereumEmbeddedWallets.forEach((wallet) => {
      addSessionSigner(wallet.address)
    })
  }, [ethereumEmbeddedWallets, addSessionSigner])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  // Function to fetch wallet balance
  const fetchBalance = useCallback(
    async (userId: string) => {
      try {
        setIsLoadingBalance(true)
        const headers = await getAuthHeaders()
        const balanceResult = await loggedApi.getWalletBalance(userId, headers)

        // Find USDC balance (try USDC_DEMO first not USDC)
        const usdcToken = balanceResult.balance.find(
          (token) => token.symbol === 'USDC_DEMO',
        )

        if (usdcToken && parseFloat(usdcToken.totalBalance) > 0) {
          // Parse the balance (it's in smallest unit, divide by 1e6 for USDC)
          const balance = parseFloat(usdcToken.totalBalance) / 1e6
          // Floor to 2 decimals to ensure we never try to send more than we have
          const flooredBalance = Math.floor(balance * 100) / 100
          setUsdcBalance(flooredBalance.toFixed(2))
        } else {
          setUsdcBalance('0.00')
        }
      } catch {
        setUsdcBalance('0.00')
      } finally {
        setIsLoadingBalance(false)
      }
    },
    [getAuthHeaders, loggedApi],
  )

  // Function to mint demo USDC
  const handleMintUSDC = useCallback(async () => {
    if (!user?.id) return

    try {
      setIsLoadingBalance(true)
      const headers = await getAuthHeaders()
      await loggedApi.fundWallet(user.id, headers)

      // Wait for the transaction to settle
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // Refresh balance after minting
      await fetchBalance(user.id)
    } catch (error) {
      console.error('Error minting USDC:', error)
      setIsLoadingBalance(false)
    }
  }, [user?.id, getAuthHeaders, loggedApi, fetchBalance])

  // Fetch balance when user logs in
  useEffect(() => {
    const initializeWallet = async () => {
      if (authenticated && user?.id && !walletCreated) {
        try {
          const userId = user.id
          await fetchBalance(userId)
          setWalletCreated(true)
        } catch (error) {
          console.error('Error fetching balance:', error)
        }
      }
    }

    initializeWallet()
  }, [authenticated, user?.id, walletCreated, fetchBalance])

  // Handle position updates from Action component
  const handlePositionUpdate = useCallback(
    (
      newDepositedAmount: string | null,
      newApy: number | null,
      newIsLoadingPosition: boolean,
      newIsLoadingApy: boolean,
      newIsInitialLoad: boolean,
    ) => {
      setDepositedAmount(newDepositedAmount)
      setApy(newApy)
      setIsLoadingPosition(newIsLoadingPosition)
      setIsLoadingApy(newIsLoadingApy)
      setIsInitialLoad(newIsInitialLoad)
    },
    [],
  )

  // Show loading state while Privy is initializing
  if (!ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="text-center">
          <div className="text-lg" style={{ color: '#666666' }}>
            Loading...
          </div>
        </div>
      </div>
    )
  }

  // Show login prompt if not authenticated
  if (!authenticated) {
    return (
      <div
        className="min-h-screen"
        style={{
          backgroundColor: '#FFFFFF',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{ height: '100vh' }}
        >
          <div className="max-w-md text-center p-8">
            <div className="mb-6">
              <img
                src="/Optimism.svg"
                alt="Optimism"
                className="h-12 mx-auto mb-4"
              />
              <h1
                className="mb-3"
                style={{
                  color: '#1a1b1e',
                  fontSize: '28px',
                  fontWeight: 600,
                }}
              >
                Welcome to Actions
              </h1>
            </div>

            <button
              onClick={() => login()}
              className="w-full py-3 px-6 font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: '#FF0420',
                color: '#FFFFFF',
                fontSize: '16px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show the main Earn page when authenticated
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Custom Header */}
      <header
        className="w-full"
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E0E2EB',
        }}
      >
        <div className="w-full px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/Optimism.svg" alt="Optimism" className="h-4" />
            </div>
            <div className="flex items-center gap-4">
              {/* Privy Dropdown Menu */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:bg-gray-50"
                  style={{
                    border: '1px solid #E5E5E5',
                    backgroundColor: dropdownOpen ? '#F5F5F5' : 'transparent',
                  }}
                >
                  <img src="/Privy.png" alt="Privy" className="h-5" />
                  <span className="text-sm" style={{ color: '#1a1b1e' }}>
                    Privy
                  </span>
                  <svg
                    className="w-4 h-4 transition-transform"
                    style={{
                      transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                      color: '#666666',
                    }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {dropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg overflow-hidden"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E5E5E5',
                      zIndex: 50,
                    }}
                  >
                    <div className="p-4">
                      <div
                        className="text-xs mb-2"
                        style={{ color: '#666666' }}
                      >
                        Signed in as
                      </div>
                      <div
                        className="text-sm mb-4"
                        style={{ color: '#1a1b1e', fontWeight: 500 }}
                      >
                        {user?.email?.address || 'Connected'}
                      </div>
                      <button
                        onClick={() => logout()}
                        className="w-full px-4 py-2 rounded-lg transition-all hover:bg-gray-50"
                        style={{
                          border: '1px solid #E5E5E5',
                          backgroundColor: 'transparent',
                          color: '#1a1b1e',
                          fontSize: '14px',
                          cursor: 'pointer',
                        }}
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex" style={{ height: 'calc(100vh - 65px)' }}>
        {/* Left Content Area */}
        <div
          className="flex-1 flex flex-col items-center p-8 overflow-y-auto"
          style={{ maxWidth: 'calc(100% - 436px)' }}
        >
          <div className="w-full max-w-2xl">
            {/* Title Section */}
            <div className="mb-8 text-left">
              <div className="flex items-center gap-2 mb-2">
                <h1
                  style={{
                    color: '#1a1b1e',
                    fontSize: '24px',
                    fontStyle: 'normal',
                    fontWeight: 600,
                  }}
                >
                  Actions Demo
                </h1>
                <span
                  className="px-2 py-2 text-xs font-medium rounded"
                  style={{
                    backgroundColor: '#F2F3F8',
                    color: '#404454',
                    fontSize: '14px',
                    fontWeight: 400,
                  }}
                >
                  Sandbox
                </span>
              </div>
              <p
                style={{
                  color: '#666666',
                  fontSize: '16px',
                }}
              >
                Earn interest by lending USDC
              </p>
            </div>

            <div className="space-y-6">
              <Action
                usdcBalance={usdcBalance}
                isLoadingBalance={isLoadingBalance}
                onMintUSDC={handleMintUSDC}
                onTransactionSuccess={async () => {
                  if (user?.id) {
                    // Wait a bit for the transaction to settle
                    await new Promise((resolve) => setTimeout(resolve, 2000))
                    await fetchBalance(user.id)
                  }
                }}
                onPositionUpdate={handlePositionUpdate}
              />
              <LentBalance
                depositedAmount={depositedAmount}
                apy={apy}
                isLoadingPosition={isLoadingPosition}
                isLoadingApy={isLoadingApy}
                isInitialLoad={isInitialLoad}
              />
              <Info />
            </div>
          </div>
        </div>

        {/* Activity Log - Right Side */}
        <div style={{ width: '436px' }}>
          <ActivityLog />
        </div>
      </main>
    </div>
  )
}

function Earn() {
  return (
    <ActivityLogProvider>
      <EarnContent />
    </ActivityLogProvider>
  )
}

export default Earn
