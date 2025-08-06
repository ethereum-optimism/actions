import { useState, useEffect } from 'react'
import type {
  WalletData,
  CreateWalletResponse,
} from '@eth-optimism/verbs-sdk'
import { verbsApi } from '../api/verbsApi'

interface Transaction {
  id: string
  type: 'interest' | 'payment' | 'transfer'
  description: string
  amount: number
  date: Date
  icon: string
}



type ViewType = 'home' | 'accounts' | 'personal-usd' | 'apy-info' | 'lending' | 'position-detail'

const Revolut = () => {
  // State management
  const [currentView, setCurrentView] = useState<ViewType>('home')
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null)
  const [userBalance, setUserBalance] = useState({
    usd: 12828.73,
    cefiSavings: 2000.00
  })
  const [isLoading, setIsLoading] = useState(false)
  const [morphoApy, setMorphoApy] = useState<number | null>(null)
  const [lendingAmount, setLendingAmount] = useState('')
  const [lendingStep, setLendingStep] = useState<'amount' | 'confirm' | 'processing' | 'success'>('amount')
  const [wasPositionAddition, setWasPositionAddition] = useState<boolean>(false)
  const [lastTxHash, setLastTxHash] = useState<string>('')
  const [selectedPosition, setSelectedPosition] = useState<{
    id: string
    amount: number
    apy: number
    protocol: string
    date: Date
    txHash: string
  } | null>(null)
  const [lendingPositions, setLendingPositions] = useState<Array<{
    id: string
    amount: number
    apy: number
    protocol: string
    date: Date
    txHash: string
  }>>([])

  // Mock transaction data
  const [transactions] = useState<Transaction[]>([
    {
      id: '1',
      type: 'interest',
      description: 'Interest paid',
      amount: 7.39,
      date: new Date('2024-08-01T05:00:00'),
      icon: '%'
    },
    {
      id: '2',
      type: 'interest',
      description: 'Interest paid',
      amount: 7.13,
      date: new Date('2024-07-01T05:00:00'),
      icon: '%'
    },
    {
      id: '3',
      type: 'interest',
      description: 'Interest paid',
      amount: 8.18,
      date: new Date('2024-06-02T05:00:00'),
      icon: '%'
    }
  ])

  // Initialize wallet on component mount
  useEffect(() => {
    const init = async () => {
      await initializeWallet()
      await fetchMorphoApy()
    }
    init()
  }, [])

  const initializeWallet = async () => {
    console.log('Initializing real wallet via Privy...')
    
    try {
      // First check if we have existing wallets
      const walletsResponse = await verbsApi.getAllWallets()
      console.log('Existing wallets:', walletsResponse)
      
      if (walletsResponse.wallets.length > 0) {
        // Use the first existing wallet
        const existingWallet = walletsResponse.wallets[0]
        console.log('Using existing wallet:', existingWallet)
        setSelectedWallet(existingWallet)
        
        // Fund the wallet if needed
        await fundWalletIfNeeded(existingWallet.id)
      } else {
        // Create a new wallet via Privy
        console.log('Creating new wallet via Privy API...')
        const uniqueUserId = `revolut-user-${Date.now()}-${Math.random().toString(36).substring(7)}`
        const createResponse = await verbsApi.createWallet(uniqueUserId)
        console.log('Wallet creation response:', createResponse)
        
        // Convert CreateWalletResponse to WalletData format
        const newWallet: WalletData = {
          id: createResponse.userId,
          address: createResponse.address
        }
        console.log('New wallet created:', newWallet)
        setSelectedWallet(newWallet)
        
        // Fund the new wallet
        await fundWalletIfNeeded(newWallet.id)
      }
    } catch (error) {
      console.error('Failed to initialize real wallet:', error)
      // Fallback to mock wallet only if API completely fails
      const mockWallet: WalletData = {
        id: 'revolut-demo-user-fallback',
        address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`
      }
      console.log('Using fallback mock wallet:', mockWallet)
      setSelectedWallet(mockWallet)
    }
  }
  
  const fundWalletIfNeeded = async (walletId: string) => {
    try {
      console.log('Checking wallet balance and funding if needed...')
      const balanceResult = await verbsApi.getWalletBalance(walletId)
      
      const usdcToken = balanceResult.balance.find(token => token.symbol === 'USDC')
      const usdcBalance = usdcToken ? parseFloat(usdcToken.totalBalance) / 1e6 : 0
      
      const ethToken = balanceResult.balance.find(token => token.symbol === 'ETH')
      const ethBalance = ethToken ? parseFloat(ethToken.totalBalance) / 1e18 : 0
      
      console.log(`Current balances - ETH: ${ethBalance}, USDC: ${usdcBalance}`)
      
      // Fund with ETH first (needed for gas fees)
      if (ethBalance < 0.1) {
        console.log('Funding wallet with ETH...')
        try {
          const ethFundResult = await verbsApi.fundWallet(walletId, 'ETH')
          console.log('Wallet funded with ETH:', ethFundResult)
        } catch (error) {
          console.error('Failed to fund with ETH:', error)
        }
      }
      
      // Fund with USDC if needed
      if (usdcBalance < 100) {
        console.log('Funding wallet with USDC...')
        try {
          const usdcFundResult = await verbsApi.fundWallet(walletId, 'USDC')
          console.log('Wallet funded with USDC:', usdcFundResult)
        } catch (error) {
          console.error('Failed to fund with USDC:', error)
        }
      }
      
      if (ethBalance >= 0.1 && usdcBalance >= 100) {
        console.log('Wallet has sufficient balance')
      }
    } catch (error) {
      console.error('Failed to check/fund wallet:', error)
    }
  }

  const fetchMorphoApy = async () => {
    try {
      console.log('Fetching Morpho APY...')
      const vaultsResponse = await verbsApi.getVaults()
      console.log('Vaults response:', vaultsResponse)
      if (vaultsResponse.vaults.length > 0) {
        // Get the highest APY vault
        const bestVault = vaultsResponse.vaults.reduce((prev, current) => 
          (prev.apy > current.apy) ? prev : current
        )
        console.log('Best vault:', bestVault)
        setMorphoApy(bestVault.apy * 100) // Convert to percentage
        console.log('Set Morpho APY to:', bestVault.apy * 100)
      } else {
        console.log('No vaults found, setting default APY')
        setMorphoApy(5.25) // Set a default higher APY for demo
      }
    } catch (error) {
      console.error('Failed to fetch Morpho APY:', error)
      // Set a fallback APY for demo purposes
      setMorphoApy(5.25)
    }
  }



  const handleEnableHigherApy = () => {
    setCurrentView('lending')
    setLendingStep('amount')
    setWasPositionAddition(false)
  }

  const handlePositionClick = (position: {
    id: string
    amount: number
    apy: number
    protocol: string
    date: Date
    txHash: string
  }) => {
    console.log('Position clicked:', position)
    setSelectedPosition(position)
    setCurrentView('position-detail')
  }

  const handleLendingAmountSubmit = async () => {
    if (!selectedWallet || !lendingAmount) {
      console.log('Missing wallet or amount:', { selectedWallet, lendingAmount })
      return
    }

    const amount = parseFloat(lendingAmount)
    if (isNaN(amount) || amount <= 0 || amount > userBalance.cefiSavings) {
      alert(`Invalid amount. Please enter a value between 0 and ${userBalance.cefiSavings}`)
      return
    }

    console.log('Starting lending process:', { amount, walletId: selectedWallet.id })
    setLendingStep('processing')
    setIsLoading(true)

    try {
      // Use real API to execute lending transaction on Supersim
      console.log('Executing real lending transaction via Morpho API...')
      
      const lendResult = await verbsApi.lendDeposit(
        selectedWallet.id,
        amount,
        'usdc'
      )
      
      console.log('Real lending transaction successful:', lendResult)
      const realTxHash = lendResult.transaction.hash
      setLastTxHash(realTxHash)

      // Update local balance after successful transaction
      setUserBalance(prev => ({
        ...prev,
        cefiSavings: prev.cefiSavings - amount
      }))

      // Check if there's already a Morpho position to update
      setLendingPositions(prev => {
        const existingMorphoIndex = prev.findIndex(pos => pos.protocol === 'Morpho')
        
        if (existingMorphoIndex >= 0) {
          // Update existing position
          const updatedPositions = [...prev]
          const existingPosition = updatedPositions[existingMorphoIndex]
          updatedPositions[existingMorphoIndex] = {
            ...existingPosition,
            amount: existingPosition.amount + amount, // Add to existing amount
            apy: morphoApy || existingPosition.apy, // Update APY if available
            txHash: realTxHash, // Update with latest transaction hash
            date: existingPosition.date // Keep original start date
          }
          return updatedPositions
        } else {
          // Create new position if none exists
          const newPosition = {
            id: `pos-${Date.now()}`,
            amount: amount,
            apy: morphoApy || 5.25,
            protocol: 'Morpho',
            date: new Date(),
            txHash: realTxHash
          }
          return [...prev, newPosition]
        }
      })

      // Check if this was an addition to existing position
      const wasAddition = lendingPositions.some(pos => pos.protocol === 'Morpho')
      setWasPositionAddition(wasAddition)
      
      setLendingStep('success')
      console.log(`✅ Real transaction completed! Hash: ${realTxHash}`)
      console.log(wasAddition ? 'Added to existing Morpho position' : 'Created new Morpho position')
    } catch (error) {
      console.error('Real lending transaction failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      alert('Lending failed: ' + errorMessage)
      setLendingStep('amount')
    } finally {
      setIsLoading(false)
    }
  }

  // Mobile Status Bar Component
  const StatusBar = () => (
    <div className="flex justify-between items-center px-4 py-2 text-white text-sm font-medium">
      <div className="flex items-center gap-1">
        <span>11:56</span>
        <span className="text-xs">🌙</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="flex gap-1">
          <div className="w-1 h-3 bg-white rounded-full"></div>
          <div className="w-1 h-3 bg-white rounded-full"></div>
          <div className="w-1 h-3 bg-white rounded-full"></div>
          <div className="w-1 h-3 bg-white/50 rounded-full"></div>
        </div>
        <span className="ml-1">📶</span>
        <div className="ml-1 w-6 h-3 bg-white rounded-sm relative">
          <div className="absolute right-0 top-0 w-4 h-full bg-green-400 rounded-sm"></div>
        </div>
      </div>
    </div>
  )

  // Bottom Navigation Component
  const BottomNavigation = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-sm">
      <div className="flex justify-around items-center py-2">
        {[
          { id: 'home', label: 'Home', icon: '🏠', active: currentView === 'home' },
          { id: 'invest', label: 'Invest', icon: '📈', active: false },
          { id: 'payments', label: 'Payments', icon: '💳', active: false },
          { id: 'lifestyle', label: 'Lifestyle', icon: '🎯', active: false }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => tab.id === 'home' && setCurrentView('home')}
            className={`flex flex-col items-center py-2 px-4 ${
              tab.active ? 'text-white' : 'text-gray-400'
            }`}
          >
            <span className="text-lg mb-1">{tab.icon}</span>
            <span className="text-xs">{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="h-6 bg-gray-900"></div>
    </div>
  )

  return (
    <div className="w-full h-screen bg-gradient-to-b from-purple-600 via-purple-700 to-indigo-900 text-white overflow-hidden">
      <StatusBar />
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto pb-20">
        {currentView === 'home' && (
          <div className="p-4">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-light mb-2">CeFi Savings</h1>
              <div className="text-5xl font-light mb-2">
                ${userBalance.cefiSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-lg text-purple-200">2.75% APY</div>
            </div>

            <div className="flex justify-center mb-8">
              <button 
                onClick={() => setCurrentView('accounts')}
                className="bg-white/20 backdrop-blur-sm px-6 py-2 rounded-full text-white font-medium"
              >
                Accounts
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-around mb-8">
              {[
                { icon: '+', label: 'Add money' },
                { icon: '↓', label: 'Withdraw' },
                { icon: 'ℹ️', label: 'Info' },
                { icon: '⋯', label: 'More' }
              ].map((action) => (
                <div key={action.label} className="flex flex-col items-center">
                  <button className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-xl mb-2">
                    {action.icon}
                  </button>
                  <span className="text-sm text-purple-200">{action.label}</span>
                </div>
              ))}
            </div>

            {/* APY Enhancement Banner */}
            {lendingPositions.length === 0 && (
              <div 
                onClick={() => {
                  console.log('Banner clicked, navigating to apy-info')
                  setCurrentView('apy-info')
                }}
                className="bg-gradient-to-r from-green-400 to-blue-500 rounded-lg p-4 mb-6 flex items-center justify-between cursor-pointer relative overflow-hidden shadow-lg"
              >
                <div className="flex-1">
                  <h3 className="text-white font-semibold mb-1">Enable higher APY on your savings</h3>
                  <p className="text-white/90 text-sm">Get {morphoApy ? `${morphoApy.toFixed(2)}%` : 'higher'} APY with High Interest Savings</p>
                </div>
                <div className="flex items-center">
                  <div className="text-2xl mr-2">🎁</div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation()
                      console.log('Close button clicked')
                    }}
                    className="text-white/60 text-xl hover:text-white/80"
                  >
                    ✕
                  </button>
                </div>
                {/* Decorative elements */}
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full"></div>
                <div className="absolute -right-8 -bottom-8 w-20 h-20 bg-white/5 rounded-full"></div>
              </div>
            )}

            {/* DeFi Summary */}
            {lendingPositions.length > 0 && (
              <div className="mb-6 bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold">High Interest Savings</div>
                    <div className="text-sm text-purple-200">
                      {lendingPositions.length} active position{lendingPositions.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      ${lendingPositions.reduce((sum, pos) => sum + pos.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-sm text-green-400">
                      +${lendingPositions.reduce((sum, pos) => sum + (pos.amount * pos.apy / 100 / 365), 0).toFixed(2)}/day
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setCurrentView('accounts')}
                  className="text-xs text-blue-300 hover:text-blue-200"
                >
                  View positions →
                </button>
              </div>
            )}

            {/* Transactions */}
            <div className="space-y-3">
              {transactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center mr-3">
                      <span className="text-white font-bold">{transaction.icon}</span>
                    </div>
                    <div>
                      <div className="font-medium">{transaction.description}</div>
                      <div className="text-sm text-purple-200">
                        {transaction.date.toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          hour: 'numeric', 
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="text-green-400 font-medium">
                    +${transaction.amount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === 'accounts' && (
          <div className="p-4">
            <div className="flex items-center mb-6">
              <button onClick={() => setCurrentView('home')} className="text-white mr-4">
                ✕
              </button>
              <h1 className="text-xl font-medium">Personal</h1>
            </div>

            {/* Accounts Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-medium">Accounts</h2>
                <span className="text-white">^</span>
              </div>
              <button 
                onClick={() => setCurrentView('personal-usd')}
                className="w-full bg-white/10 backdrop-blur-sm rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                    <span className="text-white text-xs">🇺🇸</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium">US dollar</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">${userBalance.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                </div>
              </button>
            </div>

            {/* Savings Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-medium">Savings</h2>
                <span className="text-white">^</span>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center mr-3">
                    <span className="text-white font-bold">○</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">CeFi Savings</div>
                    <div className="text-sm text-purple-200">2.75% APY</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">${userBalance.cefiSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* DeFi Positions Section */}
            {lendingPositions.length > 0 && (
                              <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-medium">High Interest Savings</h2>
                    <span className="text-white">^</span>
                  </div>
                <div className="space-y-3">
                  {lendingPositions.map((position) => (
                    <div 
                      key={position.id} 
                      className="bg-white/10 backdrop-blur-sm rounded-lg p-4 cursor-pointer hover:bg-white/15 transition-colors"
                      onClick={() => handlePositionClick(position)}
                    >
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
                          <span className="text-white font-bold">M</span>
                        </div>
                                                 <div className="flex-1">
                           <div className="font-medium">High Interest Savings</div>
                           <div className="text-sm text-purple-200">{position.apy.toFixed(2)}% APY</div>
                          <div className="text-xs text-purple-300">
                            {position.date.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">${position.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                          <div className="text-xs text-green-400">+${(position.amount * position.apy / 100 / 365).toFixed(2)}/day</div>
                          <div className="text-xs text-purple-400 mt-1">Tap for details</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <button className="bg-white/20 backdrop-blur-sm px-6 py-3 rounded-full text-white font-medium flex items-center">
                <span className="mr-2">+</span>
                Add new
              </button>
            </div>
          </div>
        )}

        {currentView === 'personal-usd' && (
          <div className="p-4">
            <div className="flex items-center mb-6">
              <button onClick={() => setCurrentView('accounts')} className="text-white mr-4">
                ←
              </button>
            </div>
            
            {/* Status indicator */}
            {(!selectedWallet || !morphoApy) && (
              <div className="mb-4 p-2 bg-black/20 rounded text-xs">
                {!selectedWallet && <div>⚠️ Initializing wallet...</div>}
                {!morphoApy && <div>⚠️ Loading Morpho APY...</div>}
              </div>
            )}

            <div className="text-center mb-8">
              <div className="text-sm text-purple-200 mb-2">Personal • USD</div>
              <div className="text-5xl font-light mb-4">
                ${userBalance.usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              
              <div className="flex justify-center mb-8">
                <button className="bg-white/20 backdrop-blur-sm px-6 py-2 rounded-full text-white font-medium">
                  Accounts
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-around mb-8">
              {[
                { icon: '+', label: 'Add money' },
                { icon: '⇄', label: 'Exchange' },
                { icon: '🏛️', label: 'Details' },
                { icon: '⋯', label: 'More' }
              ].map((action) => (
                <div key={action.label} className="flex flex-col items-center">
                  <button className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-xl mb-2">
                    {action.icon}
                  </button>
                  <span className="text-sm text-purple-200">{action.label}</span>
                </div>
              ))}
            </div>



            {/* Transaction list placeholder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                    <span className="text-white text-xs">📱</span>
                  </div>
                  <div>
                    <div className="font-medium">AppFolio</div>
                    <div className="text-sm text-purple-200">Aug 4, 1:41 AM</div>
                    <div className="text-xs text-purple-300">e62a92bf49e34616b25e12b4b7244e17</div>
                  </div>
                </div>
                <div className="text-red-400 font-medium">-$2.49</div>
              </div>
                         </div>
           </div>
         )}

         {currentView === 'apy-info' && (
           <div className="p-4">
             <div className="flex items-center mb-6">
               <button onClick={() => setCurrentView('home')} className="text-white mr-4">
                 ←
               </button>
               <h1 className="text-xl font-medium">Higher APY Available</h1>
             </div>

             <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
               <h2 className="text-2xl font-semibold mb-4">Upgrade Your Savings</h2>
               
               <div className="space-y-4 mb-6">
                 <div className="flex justify-between items-center">
                   <span className="text-purple-200">Current CeFi APY</span>
                   <span className="text-xl font-semibold">2.75%</span>
                 </div>
                 
                 <div className="flex justify-between items-center">
                   <span className="text-green-300">New Morpho DeFi APY</span>
                   <span className="text-xl font-semibold text-green-400">
                     {morphoApy ? `${morphoApy.toFixed(2)}%` : 'Loading...'}
                   </span>
                 </div>
                 
                 <hr className="border-white/20" />
                 
                 <div className="flex justify-between items-center">
                   <span className="text-white font-medium">Potential increase</span>
                   <span className="text-2xl font-bold text-green-400">
                     {morphoApy ? `+${(morphoApy - 2.75).toFixed(2)}%` : '...'}
                   </span>
                 </div>
               </div>

               <div className="bg-blue-500/20 rounded-lg p-4 mb-6">
                 <h3 className="font-semibold mb-2">How it works</h3>
                 <p className="text-sm text-purple-200">
                   Your savings will be lent to verified borrowers through Morpho's decentralized lending protocol, 
                   earning higher yields while maintaining security through over-collateralization.
                 </p>
               </div>

                               <button
                  onClick={handleEnableHigherApy}
                  disabled={!morphoApy || !selectedWallet}
                  className="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white py-4 rounded-lg font-semibold text-lg disabled:opacity-50"
                >
                  {!selectedWallet ? 'Initializing Wallet...' : 'Enable New APY'}
                </button>
             </div>
           </div>
         )}

         {currentView === 'position-detail' && selectedPosition && (
           <div className="p-4">
             <div className="flex items-center mb-6">
               <button onClick={() => setCurrentView('personal-usd')} className="text-white mr-4">
                 ←
               </button>
               <h1 className="text-xl font-medium">High Interest Savings</h1>
             </div>

             {/* Position Overview */}
             <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
               <div className="flex items-center mb-4">
                 <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mr-4">
                   <span className="text-white font-bold text-lg">M</span>
                 </div>
                 <div>
                   <h2 className="text-xl font-semibold">Morpho Protocol</h2>
                   <p className="text-purple-200 text-sm">Decentralized lending</p>
                 </div>
               </div>

               <div className="space-y-4">
                 <div className="flex justify-between items-center">
                   <span className="text-purple-200">Principal Amount</span>
                   <span className="text-xl font-semibold">${selectedPosition.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                 </div>
                 
                 <div className="flex justify-between items-center">
                   <span className="text-purple-200">Current APY</span>
                   <span className="text-xl font-semibold text-green-400">{selectedPosition.apy.toFixed(2)}%</span>
                 </div>
                 
                 <div className="flex justify-between items-center">
                   <span className="text-purple-200">Daily Earnings</span>
                   <span className="text-lg font-medium text-green-400">
                     +${(selectedPosition.amount * selectedPosition.apy / 100 / 365).toFixed(2)}
                   </span>
                 </div>
                 
                 <div className="flex justify-between items-center">
                   <span className="text-purple-200">Started</span>
                   <span className="text-white">
                     {selectedPosition.date.toLocaleDateString('en-US', { 
                       month: 'long', 
                       day: 'numeric',
                       year: 'numeric'
                     })}
                   </span>
                 </div>
                 
                 <hr className="border-white/20" />
                 
                 {/* Estimated Yield */}
                 <div className="bg-green-500/10 rounded-lg p-4">
                   <h3 className="font-semibold mb-2 text-green-400">Projected Annual Yield</h3>
                   <div className="text-2xl font-bold text-green-400">
                     +${(selectedPosition.amount * selectedPosition.apy / 100).toFixed(2)}
                   </div>
                   <p className="text-sm text-green-300 mt-1">Based on current APY</p>
                 </div>
               </div>
             </div>

             {/* Transaction Details */}
             <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
               <h3 className="font-semibold mb-4">Transaction Details</h3>
               <div className="space-y-3">
                 <div className="flex justify-between">
                   <span className="text-purple-200">Transaction Hash</span>
                   <button 
                     onClick={() => {
                       navigator.clipboard.writeText(selectedPosition.txHash)
                       alert('Transaction hash copied!')
                     }}
                     className="text-blue-400 underline text-sm break-all max-w-[200px] text-right"
                   >
                     {selectedPosition.txHash.slice(0, 8)}...{selectedPosition.txHash.slice(-8)}
                   </button>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-purple-200">Status</span>
                   <span className="text-green-400 font-medium">Active</span>
                 </div>
                 <div className="flex justify-between">
                   <span className="text-purple-200">Protocol</span>
                   <span className="text-white">{selectedPosition.protocol}</span>
                 </div>
               </div>
             </div>

             {/* Add More Funds */}
             <div className="space-y-4">
                               <button
                  onClick={() => {
                    setCurrentView('lending')
                    setLendingStep('amount')
                    setWasPositionAddition(false)
                  }}
                  className="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white py-4 rounded-lg font-semibold text-lg"
                >
                  Add More Funds
                </button>
               
               <button
                 onClick={() => setCurrentView('personal-usd')}
                 className="w-full bg-white/20 backdrop-blur-sm text-white py-4 rounded-lg font-semibold"
               >
                 Back to Account
               </button>
             </div>
           </div>
         )}

         {currentView === 'lending' && (
           <div className="p-4">
             <div className="flex items-center mb-6">
               <button onClick={() => setCurrentView('apy-info')} className="text-white mr-4">
                 ←
               </button>
               <h1 className="text-xl font-medium">Enable Higher APY</h1>
             </div>

             {lendingStep === 'amount' && (
               <div>
                 <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
                   <h2 className="text-xl font-semibold mb-4">How much would you like to lend?</h2>
                   
                   <div className="mb-4">
                     <div className="text-sm text-purple-200 mb-2">Available in CeFi Savings</div>
                     <div className="text-2xl font-semibold">
                       ${userBalance.cefiSavings.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                     </div>
                   </div>

                   <div className="mb-6">
                     <label className="block text-sm text-purple-200 mb-2">Amount to lend (USDC)</label>
                     <input
                       type="number"
                       value={lendingAmount}
                       onChange={(e) => setLendingAmount(e.target.value)}
                       max={userBalance.cefiSavings}
                       placeholder="Enter amount"
                       className="w-full bg-white/20 backdrop-blur-sm rounded-lg p-4 text-white placeholder-purple-200 text-xl"
                     />
                   </div>

                   <div className="flex gap-2 mb-6">
                     {[25, 50, 75, 100].map((percent) => (
                       <button
                         key={percent}
                         onClick={() => setLendingAmount((userBalance.cefiSavings * percent / 100).toString())}
                         className="flex-1 bg-white/20 backdrop-blur-sm rounded-lg py-2 text-sm"
                       >
                         {percent}%
                       </button>
                     ))}
                   </div>

                   <button
                     onClick={() => setLendingStep('confirm')}
                     disabled={!lendingAmount || parseFloat(lendingAmount) <= 0}
                     className="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white py-4 rounded-lg font-semibold disabled:opacity-50"
                   >
                     Continue
                   </button>
                 </div>
               </div>
             )}

             {lendingStep === 'confirm' && (
               <div>
                 <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6">
                   <h2 className="text-xl font-semibold mb-6">Confirm Transaction</h2>
                   
                   <div className="space-y-4 mb-6">
                     <div className="flex justify-between">
                       <span className="text-purple-200">Amount</span>
                       <span className="font-semibold">${parseFloat(lendingAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC</span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-purple-200">Current APY</span>
                       <span>2.75%</span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-purple-200">New APY</span>
                       <span className="text-green-400 font-semibold">
                         {morphoApy ? `${morphoApy.toFixed(2)}%` : 'Loading...'}
                       </span>
                     </div>
                     <div className="flex justify-between">
                       <span className="text-purple-200">Product</span>
                       <span>High Interest Savings</span>
                     </div>
                   </div>

                   <div className="flex gap-4">
                     <button
                       onClick={() => setLendingStep('amount')}
                       className="flex-1 bg-white/20 backdrop-blur-sm text-white py-4 rounded-lg font-semibold"
                     >
                       Back
                     </button>
                     <button
                       onClick={handleLendingAmountSubmit}
                       disabled={isLoading}
                       className="flex-1 bg-gradient-to-r from-green-500 to-blue-500 text-white py-4 rounded-lg font-semibold disabled:opacity-50"
                     >
                       {isLoading ? 'Processing...' : 'Confirm'}
                     </button>
                   </div>
                 </div>
               </div>
             )}

             {lendingStep === 'processing' && (
               <div className="text-center py-12">
                 <div className="animate-spin w-16 h-16 border-4 border-white/20 border-t-white rounded-full mx-auto mb-4"></div>
                 <h2 className="text-xl font-semibold mb-2">Processing Transaction</h2>
                 <p className="text-purple-200">Please wait while we move your funds to High Interest Savings...</p>
               </div>
             )}

             {lendingStep === 'success' && (
               <div className="text-center py-12">
                 <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                   <span className="text-white text-2xl">✓</span>
                 </div>
                 <h2 className="text-xl font-semibold mb-2">Success!</h2>
                                 <p className="text-purple-200 mb-6">
                  {wasPositionAddition 
                    ? `Successfully added $${parseFloat(lendingAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC to your High Interest Savings position`
                    : `Successfully moved $${parseFloat(lendingAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} USDC to High Interest Savings`
                  }
                </p>
                 <div className="bg-black/20 rounded p-3 mb-6 text-sm">
                   <div className="text-purple-200">Transaction Hash:</div>
                   <div className="font-mono text-xs break-all">{lastTxHash}</div>
                 </div>
                 <button
                   onClick={() => {
                                         setCurrentView('home')
                    setLendingStep('amount')
                    setLendingAmount('')
                    setLastTxHash('')
                    setWasPositionAddition(false)
                   }}
                   className="bg-gradient-to-r from-green-500 to-blue-500 text-white py-4 px-8 rounded-lg font-semibold"
                 >
                   Done
                 </button>
               </div>
             )}
           </div>
         )}
       </div>

       <BottomNavigation />
     </div>
   )
}

export default Revolut 