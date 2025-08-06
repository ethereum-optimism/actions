import { useState, useEffect } from 'react'
import { verbsApi } from '../api/verbsApi'

interface VaultData {
  address: string
  name: string
  apy: number
  asset: string
  apyBreakdown: {
    nativeApy: number
    totalRewardsApr: number
    usdc?: number
    morpho?: number
    other?: number
    performanceFee: number
    netApy: number
  }
  totalAssets: string
  totalShares: string
  fee: number
  owner: string
  curator: string
  lastUpdate: number
}

function Venmo() {
  const [isEarning, setIsEarning] = useState(false)
  const [walletBalance, setWalletBalance] = useState('0.00')
  const [isInitialLoading, setIsInitialLoading] = useState(true)

  const updateWalletBalance = async () => {
    try {
      // Get all wallets to find the first one
      const walletsResult = await verbsApi.getAllWallets()
      const wallets = walletsResult.wallets

      if (!wallets || wallets.length === 0) {
        setWalletBalance('0.00')
        return
      }

      const selectedWallet = wallets[0] // Use first wallet
      console.log('selectedWallet', selectedWallet.address)

      // Get wallet balance
      const balanceResult = await verbsApi.getWalletBalance(selectedWallet.id)
      const usdcToken = balanceResult.balance.filter(
        (token) => token.symbol.toLowerCase().includes('usdc'),
      )
      // sum the total balance of all usdc tokens
      const usdcBalance = usdcToken.reduce((acc, token) => acc + parseFloat(token.totalBalance) / 1e6, 0)

      // Format balance to 2 decimal places
      setWalletBalance(usdcBalance.toFixed(2))
    } catch (error) {
      console.error('Failed to fetch wallet balance:', error)
      setWalletBalance('0.00')
    }
  }

  const handleFundWalletWithUSDC = async () => {
    try {
      // Get all wallets to find the first one
      const walletsResult = await verbsApi.getAllWallets()
      const wallets = walletsResult.wallets

      if (!wallets || wallets.length === 0) {
        return // No wallets to fund
      }

      const selectedWallet = wallets[0] // Use first wallet
      console.log('funding wallet', selectedWallet.address)

      // Check USDC balance
      const balanceResult = await verbsApi.getWalletBalance(selectedWallet.id)
      const usdcToken = balanceResult.balance.find(
        (token) => token.symbol === 'USDC',
      )
      const usdcBalance = usdcToken ? parseFloat(usdcToken.totalBalance) / 1e6 : 0

      if (usdcBalance <= 0) {
        // Fund wallet with USDC
        await verbsApi.fundWallet(selectedWallet.id)
        console.log('Wallet funded with USDC')
        // Update balance after funding
        await updateWalletBalance()
      }
    } catch (error) {
      console.error('Failed to fund wallet:', error)
    }
  }

  const handleFundWalletWithETH = async () => {
    try {
      // Get all wallets to find the first one
      const walletsResult = await verbsApi.getAllWallets()
      const wallets = walletsResult.wallets

      if (!wallets || wallets.length === 0) {
        return // No wallets to fund
      }

      const selectedWallet = wallets[0] // Use first wallet

      // Check ETH balance
      const balanceResult = await verbsApi.getWalletBalance(selectedWallet.id)
      const ethToken = balanceResult.balance.find(
        (token) => token.symbol === 'ETH',
      )
      const ethBalance = ethToken ? parseFloat(ethToken.totalBalance) / 1e18 : 0

      if (ethBalance <= 0) {
        // Fund wallet with ETH
        await verbsApi.fundWallet(selectedWallet.id, 'ETH')
        console.log('Wallet funded with ETH')
      }
    } catch (error) {
      console.error('Failed to fund wallet:', error)
    }
  }

  useEffect(() => {
    const initializeWallet = async () => {
      await handleFundWalletWithUSDC()
      await handleFundWalletWithETH()
      // Final balance update after funding
      await updateWalletBalance()
      // Hide loading spinner after initial setup is complete
      setIsInitialLoading(false)
    }
    initializeWallet()
  }, [])

  const handleEarn = async () => {
    setIsEarning(true)
    
    try {
      // Get all wallets to find the first one (similar to selectedWallet logic)
      const walletsResult = await verbsApi.getAllWallets()
      const wallets = walletsResult.wallets

      if (!wallets || wallets.length === 0) {
        alert('No wallets found. Please create a wallet first.')
        return
      }

      const selectedWallet = wallets[0] // Use first wallet

      // Check if selected wallet has USDC balance before proceeding
      const balanceResult = await verbsApi.getWalletBalance(selectedWallet.id)
      const usdcToken = balanceResult.balance.find(
        (token) => token.symbol === 'USDC',
      )
      const usdcBalance = usdcToken ? parseFloat(usdcToken.totalBalance) / 1e6 : 0

      if (usdcBalance <= 0) {
        await verbsApi.fundWallet(selectedWallet.id)
      }

      // Get vaults and auto-select the first one
      const vaultsResult = await verbsApi.getVaults()
      
      if (vaultsResult.vaults.length === 0) {
        alert('No vaults available.')
        return
      }

      const selectedVault = vaultsResult.vaults[0] // Auto-select first vault

      // Use 50% of balance or minimum $10, whichever is higher
      const lendAmount = usdcBalance
      
      if (lendAmount > usdcBalance) {
        alert(`Insufficient balance. Need at least $${lendAmount.toFixed(2)} USDC.`)
        return
      }

      // Perform the lend operation
      const lendResult = await verbsApi.lendDeposit(
        selectedWallet.id,
        lendAmount,
        'usdc',
      )

      alert(`Successfully lent $${lendAmount.toFixed(2)} USDC to ${selectedVault.name}!\nTransaction: ${lendResult.transaction.hash}`)
      
      // Update balance after successful earn
      await updateWalletBalance()
      
    } catch (error) {
      console.error('Earn operation failed:', error)
      alert(`Failed to earn: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsEarning(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Venmo inspired */}
      <div className="bg-blue-500 text-white pt-12 pb-24 relative rounded-b-3xl">
        <div className="max-w-sm mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center">
              <div>
                <div className="flex items-center">
                  <h1 className="text-xl font-semibold">Kevin</h1>
                  <svg className="w-4 h-4 ml-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-blue-100 text-sm">@kevin</p>
              </div>
            </div>
            <div className="flex space-x-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>

          {/* Profile Circle */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full border-4 border-white/30 overflow-hidden">
              <img 
                src="/propic.png" 
                alt="Profile" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions - Venmo style */}
      <div className="max-w-sm mx-auto px-6 -mt-16 relative z-10">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 text-center shadow-sm">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <p className="font-semibold text-blue-500">Create Group</p>
          </div>
          <div className="bg-white rounded-xl p-4 text-center shadow-sm">
            <div className="flex -space-x-2 justify-center mb-3">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img 
                  src="/possum.png" 
                  alt="User 1" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img 
                  src="/phoenix.png" 
                  alt="User 2" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img 
                  src="/gerbel1.png" 
                  alt="User 3" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <p className="font-semibold text-blue-500">420+ Friends</p>
          </div>
        </div>

        {/* Main Balance Card */}
        <div className="bg-white rounded-xl shadow-sm mb-6">
          <div className="p-6 border-b border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Balance</h2>
            </div>
            
            <div className="mb-6">
              <div className="text-3xl font-bold text-gray-900 flex items-center">
                {isInitialLoading ? <div className="ml-3 animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div> : <span className="text-2xl text-gray-600">${walletBalance}</span>}
              </div>
            </div>
            <button 
              onClick={handleEarn}
              disabled={isEarning}
              className="w-full bg-blue-500 text-white px-4 py-3 rounded-full font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEarning ? 'Processing...' : 'Earn'}
            </button>
          </div>
        </div>

        {/* Features List */}
        <div className="space-y-3 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm flex items-center">
            <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center mr-4">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Smart Wallets</p>
              <p className="text-gray-500 text-sm">Gas sponsored transactions</p>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 shadow-sm flex items-center">
            <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center mr-4">
              <span className="text-white font-bold text-lg">V</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Earn More</p>
              <p className="text-gray-500 text-sm">Lend, swap, earn yield</p>
            </div>
          </div>
          
          <div className="bg-white rounded-xl p-4 shadow-sm flex items-center">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center mr-4">
              <span className="text-white font-bold text-lg">T</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Send Money</p>
              <p className="text-gray-500 text-sm">Full TypeScript support</p>
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 sm:hidden">
          <div className="flex justify-around">
            <button className="flex flex-col items-center py-2 text-blue-500">
              <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-9 9a1 1 0 001.414 1.414L2 12.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-4.586l.293.293a1 1 0 001.414-1.414l-9-9z" />
              </svg>
              <span className="text-xs">Home</span>
            </button>
            <button className="flex flex-col items-center py-2 text-gray-400">
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="text-xs">Docs</span>
            </button>
            <button className="flex flex-col items-center py-2 text-gray-400">
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
              <span className="text-xs">Demo</span>
            </button>
            <button className="flex flex-col items-center py-2 text-gray-400">
              <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="text-xs">SDK</span>
            </button>
            <button className="flex flex-col items-center py-2 text-gray-400">
              <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              <span className="text-xs">About</span>
            </button>
          </div>
        </div>

        <div className="pb-20"></div>
      </div>
    </div>
  )
}

export default Venmo