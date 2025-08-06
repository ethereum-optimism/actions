import { useState, useEffect, useRef } from 'react'
import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  WalletData,
} from '@eth-optimism/verbs-sdk'
import NavBar from './NavBar'
import { verbsApi } from '../api/verbsApi'

interface TerminalLine {
  id: string
  type: 'input' | 'output' | 'error' | 'success' | 'warning'
  content: string
  timestamp: Date
}

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

interface PendingPrompt {
  type:
    | 'userId'
    | 'lendVault'
    | 'tokenSelection'
    | 'lendAmount'
    | 'walletSendSelection'
    | 'walletSendAmount'
    | 'walletSendRecipient'
    | 'walletSelectSelection'
  message: string
  data?:
    | VaultData[]
    | WalletData[]
    | {
        selectedWallet?: WalletData
        selectedVault?: VaultData
        walletBalance?: number
        balance?: number
        amount?: number
      }
}

const HELP_CONTENT = `
Console commands:
  help          - Show this help message
  clear         - Clear the terminal
  status        - Show system status
  exit          - Exit terminal

Wallet commands:
  wallet create - Create a new wallet
  wallet select - Select a wallet to use for commands
         fund    - Fund selected wallet
         balance - Show balance of selected wallet
         lend    - Lend to Morpho vaults
         send    - Send USDC to another address

Future verbs (coming soon):
  borrow        - Borrow via Morpho
  repay         - Repay Morpho loan
  swap          - Trade via Uniswap
  earn          - Earn DeFi yield`

const Terminal = () => {
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null)
  const [screenWidth, setScreenWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  )
  const [currentWalletList, setCurrentWalletList] = useState<WalletData[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

  // Function to render content with clickable links
  const renderContentWithLinks = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = content.split(urlRegex)

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  // Helper function to shorten wallet addresses
  const shortenAddress = (address: string): string => {
    if (address.length <= 10) return address
    return `${address.slice(0, 6)}..${address.slice(-4)}`
  }

  // DRY function to format balance strings
  const formatBalance = (balance: string, decimals: number): string => {
    const balanceBigInt = BigInt(balance)
    const divisor = BigInt(10 ** decimals)
    const wholePart = balanceBigInt / divisor
    const fractionalPart = balanceBigInt % divisor

    if (fractionalPart === 0n) {
      return wholePart.toString()
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
    const trimmedFractional = fractionalStr.replace(/0+$/, '')

    if (trimmedFractional === '') {
      return wholePart.toString()
    }

    return `${wholePart}.${trimmedFractional}`
  }

  // DRY function to display wallet balance with loading state
  const displayWalletBalance = async (walletId: string, showVaultPositions: boolean = true): Promise<string> => {
    const result = await verbsApi.getWalletBalance(walletId)

    // Show ETH, USDC, and any vault balances
    const filteredBalances = result.balance.filter(
      (token) =>
        token.symbol === 'ETH' ||
        token.symbol === 'USDC' ||
        token.symbol.includes('Gauntlet') ||
        token.symbol.includes('Vault'),
    )

    // Ensure both ETH and USDC are shown, even if not in response
    const ethBalance = filteredBalances.find(
      (token) => token.symbol === 'ETH',
    )
    const usdcBalance = filteredBalances.find(
      (token) => token.symbol === 'USDC',
    )

    // Separate vault balances from token balances
    const vaultBalances = filteredBalances.filter(
      (token) => token.symbol !== 'ETH' && token.symbol !== 'USDC',
    )

    const balanceLines = [
      `ETH: ${ethBalance ? formatBalance(ethBalance.totalBalance, 18) : '0'}`,
      `USDC: ${usdcBalance ? formatBalance(usdcBalance.totalBalance, 6) : '0'}`,
    ]

    // Add vault balances if any exist and showVaultPositions is true
    if (showVaultPositions && vaultBalances.length > 0) {
      balanceLines.push('') // Empty line separator
      balanceLines.push('Vault Positions:')
      vaultBalances.forEach((vault) => {
        balanceLines.push(
          `${vault.symbol}: ${formatBalance(vault.totalBalance, 6)}`,
        ) // Assume 6 decimals for vault shares
      })
    }

    return balanceLines.join('\n')
  }

  // Focus input on mount and keep it focused
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  // Track screen width changes
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Update wallet list display when screen size changes
  useEffect(() => {
    if (currentWalletList && pendingPrompt?.type === 'walletSelectSelection') {
      // Find the wallet selection line and update it
      setLines((prev) => {
        const walletSelectIndex = prev.findIndex((line) =>
          line.content.includes('Select a wallet:')
        )
        
        if (walletSelectIndex !== -1) {
          const formatWalletColumns = (wallets: WalletData[]) => {
            const lines: string[] = []
            const totalWallets = wallets.length
            
            // Responsive column logic: 1 on mobile, 2 on tablet, 3 on desktop
            const isMobile = screenWidth < 480
            const isTablet = screenWidth >= 480 && screenWidth < 768
            
            const numColumns = isMobile ? 1 : isTablet ? 2 : 3
            const walletsPerColumn = Math.ceil(totalWallets / numColumns)
            const columnWidth = isMobile ? 0 : isTablet ? 25 : 33 // Tighter spacing for 2 cols

            for (let row = 0; row < walletsPerColumn; row++) {
              let line = ''

              for (let col = 0; col < numColumns; col++) {
                const walletIndex = col * walletsPerColumn + row

                if (walletIndex < totalWallets) {
                  const wallet = wallets[walletIndex]
                  const num = walletIndex + 1
                  const numStr = num < 10 ? ` ${num}` : `${num}`
                  const addressDisplay = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
                  const selected =
                    selectedWallet?.id === wallet.id ? ' (selected)' : ''
                  const columnText = `${numStr}. ${addressDisplay}${selected}`

                  // Add column text and pad for next column (except last column)
                  if (col < numColumns - 1) {
                    line += columnText.padEnd(columnWidth)
                  } else {
                    line += columnText
                  }
                }
              }

              // Only add non-empty lines
              if (line.trim()) {
                lines.push(line)
              }
            }

            return lines.join('\n')
          }

          const walletOptions = formatWalletColumns(currentWalletList)
          
          const updatedLine = {
            ...prev[walletSelectIndex],
            content: `Select a wallet:\n\n${walletOptions}\n\nEnter wallet number:`
          }
          
          return [
            ...prev.slice(0, walletSelectIndex),
            updatedLine,
            ...prev.slice(walletSelectIndex + 1)
          ]
        }
        
        return prev
      })
    }
  }, [screenWidth, currentWalletList, pendingPrompt, selectedWallet])

  // Keep terminal scrolled to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [lines])

  // Initialize with welcome message and run help command
  useEffect(() => {
    const initializeTerminal = async () => {
      const verbsAscii = `
█████   █████                    █████
░░███   ░░███                    ░░███
 ░███    ░███   ██████  ████████  ░███████   █████
 ░███    ░███  ███░░███░░███░░███ ░███░░███ ███░░
 ░░███   ███  ░███████  ░███ ░░░  ░███ ░███░░█████
  ░░░█████░   ░███░░░   ░███      ░███ ░███ ░░░░███
    ░░███     ░░██████  █████     ████████  ██████
     ░░░       ░░░░░░  ░░░░░     ░░░░░░░░  ░░░░░░`
      const welcomeLines: TerminalLine[] = [
        {
          id: 'welcome-ascii',
          type: 'success',
          content: verbsAscii,
          timestamp: new Date(),
        },
        {
          id: 'welcome-7',
          type: 'output',
          content: '',
          timestamp: new Date(),
        },
        {
          id: 'welcome-8',
          type: 'output',
          content: '   Verbs library for the OP Stack',
          timestamp: new Date(),
        },
        {
          id: 'welcome-9',
          type: 'output',
          content: '',
          timestamp: new Date(),
        },
        {
          id: 'help-cmd',
          type: 'input',
          content: 'verbs: $ help',
          timestamp: new Date(),
        },
        {
          id: 'help-output',
          type: 'output',
          content: HELP_CONTENT,
          timestamp: new Date(),
        },
        {
          id: 'help-end',
          type: 'output',
          content: '',
          timestamp: new Date(),
        },
      ]
      setLines(welcomeLines)
    }

    initializeTerminal()
  }, [])

  const createWallet = async (
    userId: string,
  ): Promise<CreateWalletResponse> => {
    return verbsApi.createWallet(userId)
  }

  const getAllWallets = async (): Promise<GetAllWalletsResponse> => {
    return verbsApi.getAllWallets()
  }

  const processCommand = (command: string) => {
    const trimmed = command.trim()
    if (!trimmed) return

    // Handle pending prompts
    if (pendingPrompt) {
      if (pendingPrompt.type === 'userId') {
        handleWalletCreation(trimmed)
        return
      } else if (pendingPrompt.type === 'lendVault') {
        handleLendVaultSelection((pendingPrompt.data as VaultData[]) || [])
        return
      } else if (pendingPrompt.type === 'lendAmount') {
        handleLendAmountSubmission(parseFloat(trimmed))
        return
      } else if (pendingPrompt.type === 'walletSendSelection') {
        handleWalletSendSelection(
          parseInt(trimmed),
          (pendingPrompt.data as WalletData[]) || [],
        )
        return
      } else if (pendingPrompt.type === 'walletSendAmount') {
        handleWalletSendAmount(
          parseFloat(trimmed),
          pendingPrompt.data as { selectedWallet: WalletData; balance: number },
        )
        return
      } else if (pendingPrompt.type === 'walletSendRecipient') {
        handleWalletSendRecipient(
          trimmed,
          pendingPrompt.data as {
            selectedWallet: WalletData
            balance: number
            amount: number
          },
        )
        return
      } else if (pendingPrompt.type === 'walletSelectSelection') {
        handleWalletSelectSelection(
          parseInt(trimmed),
          (pendingPrompt.data as WalletData[]) || [],
        )
        return
      } else if (pendingPrompt.type === 'tokenSelection') {
        handleTokenSelection(
          parseInt(trimmed),
          pendingPrompt.data as { selectedWallet: WalletData },
        )
        return
      }
    }

    // Add command to history
    setCommandHistory((prev) => [...prev, trimmed])
    setHistoryIndex(-1)

    // Add the command line to display
    const commandLine: TerminalLine = {
      id: `cmd-${Date.now()}`,
      type: 'input',
      content: `verbs: $ ${trimmed}`,
      timestamp: new Date(),
    }

    let response: TerminalLine
    const responseId = `resp-${Date.now()}`

    switch (trimmed.toLowerCase()) {
      case 'help':
        response = {
          id: responseId,
          type: 'output',
          content: HELP_CONTENT,
          timestamp: new Date(),
        }
        break
      case 'clear':
        setLines([])
        return
      case 'wallet create':
        setPendingPrompt({
          type: 'userId',
          message: 'Enter unique userId:',
        })
        setLines((prev) => [...prev, commandLine])
        return
      case 'wallet select':
      case 'select':
        setLines((prev) => [...prev, commandLine])
        handleWalletSelect()
        return
      case 'wallet balance':
      case 'balance': {
        setLines((prev) => [...prev, commandLine])
        handleWalletBalance()
        return
      }
      case 'wallet fund':
      case 'fund': {
        setLines((prev) => [...prev, commandLine])
        handleWalletFund()
        return
      }
      case 'wallet send':
      case 'send': {
        setLines((prev) => [...prev, commandLine])
        handleWalletSendList()
        return
      }
      case 'wallet lend':
      case 'lend': {
        setLines((prev) => [...prev, commandLine])
        handleWalletLend()
        return
      }
      case 'status':
        response = {
          id: responseId,
          type: 'success',
          content: `System Status: ONLINE
SDK Version: v0.0.2
Connected Networks: None
Active Wallets: 0`,
          timestamp: new Date(),
        }
        break
      case 'exit':
        response = {
          id: responseId,
          type: 'warning',
          content: 'The ride never ends!',
          timestamp: new Date(),
        }
        break
      case 'borrow':
      case 'repay':
      case 'swap':
      case 'earn':
      case 'wallet borrow':
      case 'wallet repay':
      case 'wallet swap':
      case 'wallet earn':
        response = {
          id: responseId,
          type: 'error',
          content: 'Soon.™',
          timestamp: new Date(),
        }
        break
      default:
        response = {
          id: responseId,
          type: 'error',
          content: `Command not found: ${trimmed}. Type "help" for available commands.`,
          timestamp: new Date(),
        }
    }

    setLines((prev) => [...prev, commandLine, response])
  }

  const handleWalletCreation = async (userId: string) => {
    const userInputLine: TerminalLine = {
      id: `input-${Date.now()}`,
      type: 'input',
      content: `Enter userId for the new wallet: ${userId}`,
      timestamp: new Date(),
    }

    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Creating wallet...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, userInputLine, loadingLine])
    setPendingPrompt(null)

    try {
      const result = await createWallet(userId)

      const successLine: TerminalLine = {
        id: `success-${Date.now()}`,
        type: 'success',
        content: `Wallet created successfully!
Address: ${result.address}
User ID: ${result.userId}`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), successLine])
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to create wallet: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleLendVaultSelection = async (vaults: VaultData[]) => {
    // Always select the first vault (default)
    const selectedVault = vaults[0]
    setPendingPrompt(null)

    console.log(
      '[FRONTEND] Selected vault:',
      selectedVault.name,
      selectedVault.address,
    )

    try {
      // Use the vault data we already have to show vault information
      const vault = selectedVault

      const nameValue = vault.name
      const netApyValue = `${(vault.apy * 100).toFixed(2)}%`
      const totalAssetsValue = `$${(parseFloat(vault.totalAssets) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const feeValue = `${(vault.fee * 100).toFixed(1)}%`
      const managerValue = 'Gauntlet'

      // APY breakdown values
      const nativeApyValue = vault.apyBreakdown
        ? `${(vault.apyBreakdown.nativeApy * 100).toFixed(2)}%`
        : 'N/A'
      const usdcRewardsValue =
        vault.apyBreakdown && vault.apyBreakdown.usdc !== undefined
          ? `${(vault.apyBreakdown.usdc * 100).toFixed(2)}%`
          : 'N/A'
      const morphoRewardsValue =
        vault.apyBreakdown && vault.apyBreakdown.morpho !== undefined
          ? `${(vault.apyBreakdown.morpho * 100).toFixed(2)}%`
          : 'N/A'
      const feeImpactValue = vault.apyBreakdown
        ? `${(vault.apyBreakdown.nativeApy * vault.apyBreakdown.performanceFee * 100).toFixed(2)}%`
        : 'N/A'

      const vaultInfoTable = `
┌──────────────────────────────────────────┐
│          VAULT INFORMATION               │
├──────────────────────────────────────────┤
│ Name:              ${nameValue.padEnd(21)} │
│ Net APY:           ${netApyValue.padEnd(21)} │
│                                          │
│ APY BREAKDOWN:                           │
│   Native APY:      ${nativeApyValue.padEnd(21)} │
│   USDC Rewards:    ${usdcRewardsValue.padEnd(21)} │
│   MORPHO Rewards:  ${morphoRewardsValue.padEnd(21)} │
│   Performance Fee: ${feeImpactValue.padEnd(21)} │
│                                          │
│ Total Assets:      ${totalAssetsValue.padEnd(21)} │
│ Management Fee:    ${feeValue.padEnd(21)} │
│ Manager:           ${managerValue.padEnd(21)} │
└──────────────────────────────────────────┘`

      const vaultInfoLine: TerminalLine = {
        id: `vault-info-${Date.now()}`,
        type: 'success',
        content: vaultInfoTable,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), vaultInfoLine])

      // Show loading state for balance
      const loadingBalanceLine: TerminalLine = {
        id: `loading-balance-${Date.now()}`,
        type: 'output',
        content: 'Loading balance...',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, loadingBalanceLine])

      // Get wallet balance using DRY function
      const walletBalanceText = await displayWalletBalance(selectedWallet!.id, true)

      // Get USDC balance for validation
      const walletBalanceResult = await verbsApi.getWalletBalance(
        selectedWallet!.id,
      )
      const usdcToken = walletBalanceResult.balance.find(
        (token) => token.symbol === 'USDC',
      )
      const usdcBalance = usdcToken
        ? parseFloat(usdcToken.totalBalance) / 1e6
        : 0 // Convert from micro-USDC

      console.log('[FRONTEND] Wallet USDC balance:', usdcBalance)

      // Show balances and ask for lend amount
      const balancesDisplay = `Wallet Balance:
${walletBalanceText}

How much would you like to lend?`

      const balancesLine: TerminalLine = {
        id: `balances-${Date.now()}`,
        type: 'output',
        content: balancesDisplay,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), balancesLine]) // Replace loading message

      // Set up prompt for lend amount
      setPendingPrompt({
        type: 'lendAmount',
        message: '',
        data: {
          selectedWallet: selectedWallet!,
          selectedVault: selectedVault,
          walletBalance: usdcBalance,
          balance: usdcBalance, // For compatibility
        },
      })
    } catch (error) {
      console.error('[FRONTEND] Error getting balances:', error)
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to get balances: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleLendAmountSubmission = async (amount: number) => {
    const promptData = pendingPrompt?.data as {
      selectedWallet: WalletData
      selectedVault: VaultData
      walletBalance: number
    }

    setPendingPrompt(null)

    console.log('[FRONTEND] Lend amount submitted:', amount)

    if (isNaN(amount) || amount <= 0) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: 'Please enter a valid positive number.',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    if (amount > promptData.walletBalance) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Insufficient balance. You have ${promptData.walletBalance} USDC available.`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    // Show processing message
    const processingLine: TerminalLine = {
      id: `processing-${Date.now()}`,
      type: 'output',
      content: `Processing lending transaction: ${amount} USDC to ${promptData.selectedVault.name}...`,
      timestamp: new Date(),
    }
    setLines((prev) => [...prev, processingLine])

    try {
      console.log('[FRONTEND] Calling lendDeposit API')
      const result = await verbsApi.lendDeposit(
        promptData.selectedWallet.id,
        amount,
        'usdc',
      )

      console.log(
        '[FRONTEND] Lend deposit successful:',
        result.transaction.hash,
      )

      const successLine: TerminalLine = {
        id: `lend-success-${Date.now()}`,
        type: 'success',
        content: `✅ Successfully lent ${amount} USDC to ${promptData.selectedVault.name}!

Vault:  ${promptData.selectedVault.name}
Amount: ${amount} USDC
Tx:     https://uniscan.xyz/tx/${result.transaction.hash || 'pending'}`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), successLine])
    } catch (error) {
      console.error('[FRONTEND] Lending failed:', error)
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to lend: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleWalletSelect = async () => {
    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Loading wallets...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, loadingLine])

    try {
      const result = await getAllWallets()

      if (result.wallets.length === 0) {
        const emptyLine: TerminalLine = {
          id: `empty-${Date.now()}`,
          type: 'error',
          content: 'No wallets available. Create one with "wallet create".',
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), emptyLine])
        return
      }

      // Format wallets in responsive columns
      const formatWalletColumns = (wallets: WalletData[]) => {
        const lines: string[] = []
        const totalWallets = wallets.length
        
        // Responsive column logic: 1 on mobile, 2 on tablet, 3 on desktop
        const isMobile = screenWidth < 480
        const isTablet = screenWidth >= 480 && screenWidth < 768
        
        const numColumns = isMobile ? 1 : isTablet ? 2 : 3
        const walletsPerColumn = Math.ceil(totalWallets / numColumns)
        const columnWidth = isMobile ? 0 : isTablet ? 25 : 33 // Tighter spacing for 2 cols

        for (let row = 0; row < walletsPerColumn; row++) {
          let line = ''

          for (let col = 0; col < numColumns; col++) {
            const walletIndex = col * walletsPerColumn + row

            if (walletIndex < totalWallets) {
              const wallet = wallets[walletIndex]
              const num = walletIndex + 1
              const numStr = num < 10 ? ` ${num}` : `${num}`
              const addressDisplay = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
              const selected =
                selectedWallet?.id === wallet.id ? ' (selected)' : ''
              const columnText = `${numStr}. ${addressDisplay}${selected}`

              // Add column text and pad for next column (except last column)
              if (col < numColumns - 1) {
                line += columnText.padEnd(columnWidth)
              } else {
                line += columnText
              }
            }
          }

          // Only add non-empty lines
          if (line.trim()) {
            lines.push(line)
          }
        }

        return lines.join('\n')
      }

      const walletOptions = formatWalletColumns(result.wallets)

      const walletSelectionLine: TerminalLine = {
        id: `wallet-select-${Date.now()}`,
        type: 'output',
        content: `Select a wallet:\n\n${walletOptions}\n\nEnter wallet number:`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), walletSelectionLine])
      setCurrentWalletList(result.wallets)
      setPendingPrompt({
        type: 'walletSelectSelection',
        message: '',
        data: result.wallets,
      })
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to load wallets: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleWalletSelectSelection = async (
    selection: number,
    wallets: WalletData[],
  ) => {
    setPendingPrompt(null)
    setCurrentWalletList(null)

    if (isNaN(selection) || selection < 1 || selection > wallets.length) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Invalid selection. Please enter a number between 1 and ${wallets.length}.`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    const selectedWalletData = wallets[selection - 1]
    setSelectedWallet(selectedWalletData)

    // Clear the wallet selection list and replace with just the success message
    setLines((prev) => {
      // Find the index of the "Select a wallet:" line and remove everything from there
      const selectWalletIndex = prev.findIndex((line) =>
        line.content.includes('Select a wallet:'),
      )

      if (selectWalletIndex !== -1) {
        // Keep everything before the wallet selection list
        const beforeSelection = prev.slice(0, selectWalletIndex)

        // Add just the success message
        const successLine: TerminalLine = {
          id: `select-success-${Date.now()}`,
          type: 'success',
          content: `Wallet selected:\n${selectedWalletData.address}`,
          timestamp: new Date(),
        }

        return [...beforeSelection, successLine]
      }

      // Fallback: just add the success line if we can't find the selection
      const successLine: TerminalLine = {
        id: `select-success-${Date.now()}`,
        type: 'success',
        content: `Wallet selected:\n${selectedWalletData.address}`,
        timestamp: new Date(),
      }
      return [...prev, successLine]
    })

    // Automatically fetch and display balance for the selected wallet
    setTimeout(async () => {
      // Add loading message
      const loadingLine: TerminalLine = {
        id: `loading-balance-${Date.now()}`,
        type: 'output',
        content: 'Loading balance...',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, loadingLine])

      try {
        const balanceText = await displayWalletBalance(selectedWalletData.id, true)

        const balanceLine: TerminalLine = {
          id: `balance-${Date.now()}`,
          type: 'output',
          content: `\n${balanceText}`,
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), balanceLine]) // Replace loading message
      } catch {
        // Replace loading message with error
        const errorLine: TerminalLine = {
          id: `balance-error-${Date.now()}`,
          type: 'error',
          content: 'Failed to load balance',
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), errorLine])
      }
    }, 100)
  }

  const handleWalletBalance = async () => {
    if (!selectedWallet) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content:
          'No wallet selected. Use "wallet select" to choose a wallet first.',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Fetching wallet balance...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, loadingLine])

    try {
      const balanceText = await displayWalletBalance(selectedWallet.id, true)

      const successLine: TerminalLine = {
        id: `success-${Date.now()}`,
        type: 'success',
        content: `Wallet balance for ${selectedWallet.address}:\n\n${balanceText}`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), successLine])
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to fetch wallet balance: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleWalletFund = async () => {
    if (!selectedWallet) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content:
          'No wallet selected. Use "wallet select" to choose a wallet first.',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    // Show token selection
    const tokenSelectionLine: TerminalLine = {
      id: `token-selection-${Date.now()}`,
      type: 'output',
      content: `Select token to fund wallet with:\n\n1. ETH\n2. USDC\n\nEnter token number:`,
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, tokenSelectionLine])
    setPendingPrompt({
      type: 'tokenSelection',
      message: '',
      data: { selectedWallet },
    })
  }

  const handleTokenSelection = async (
    selection: number,
    data: { selectedWallet: WalletData },
  ) => {
    setPendingPrompt(null)

    if (isNaN(selection) || selection < 1 || selection > 2) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Invalid selection. Please enter 1 for ETH or 2 for USDC.`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    const { selectedWallet } = data
    const tokenType = selection === 1 ? 'ETH' : 'USDC'

    const fundingLine: TerminalLine = {
      id: `funding-${Date.now()}`,
      type: 'output',
      content: `Funding wallet with ${tokenType}...`,
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, fundingLine])

    try {
      // Fund the wallet with selected token
      const { amount } = await verbsApi.fundWallet(selectedWallet.id, tokenType)

      const fundSuccessLine: TerminalLine = {
        id: `fund-success-${Date.now()}`,
        type: 'success',
        content: `Wallet funded with ${amount} ${tokenType} successfully! Fetching updated balance...`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), fundSuccessLine])

      // Then fetch and show the balance using DRY function
      const balanceText = await displayWalletBalance(selectedWallet.id, true)

      const balanceSuccessLine: TerminalLine = {
        id: `balance-success-${Date.now()}`,
        type: 'success',
        content: `Updated wallet balance for ${selectedWallet.address}:\n\n${balanceText}`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, balanceSuccessLine])
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleWalletLend = async () => {
    if (!selectedWallet) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content:
          'No wallet selected. Use "wallet select" to choose a wallet first.',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    // Check if selected wallet has USDC balance before proceeding
    try {
      const balanceResult = await verbsApi.getWalletBalance(selectedWallet.id)
      const usdcToken = balanceResult.balance.find(
        (token) => token.symbol === 'USDC',
      )
      const usdcBalance = usdcToken ? parseFloat(usdcToken.totalBalance) : 0

      if (usdcBalance <= 0) {
        const noBalanceLine: TerminalLine = {
          id: `no-balance-${Date.now()}`,
          type: 'error',
          content:
            'Selected wallet has no USDC balance. Fund the wallet first.',
          timestamp: new Date(),
        }
        setLines((prev) => [...prev, noBalanceLine])
        return
      }

      // Skip provider selection and go directly to vault selection
      const loadingLine: TerminalLine = {
        id: `loading-${Date.now()}`,
        type: 'output',
        content: 'Loading vaults...',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, loadingLine])

      try {
        const result = await verbsApi.getVaults()

        if (result.vaults.length === 0) {
          const emptyLine: TerminalLine = {
            id: `empty-${Date.now()}`,
            type: 'error',
            content: 'No vaults available.',
            timestamp: new Date(),
          }
          setLines((prev) => [...prev.slice(0, -1), emptyLine])
          return
        }

        const vaultOptions = result.vaults
          .map(
            (vault, index) =>
              `${index === 0 ? '> ' : '  '}${vault.name} - ${(vault.apy * 100).toFixed(2)}% APY`,
          )
          .join('\n')

        const vaultSelectionLine: TerminalLine = {
          id: `vault-selection-${Date.now()}`,
          type: 'output',
          content: `Select a Lending vault:

${vaultOptions}

[Enter] to select, [↑/↓] to navigate`,
          timestamp: new Date(),
        }

        setLines((prev) => [...prev.slice(0, -1), vaultSelectionLine])
        setPendingPrompt({
          type: 'lendVault',
          message: '',
          data: result.vaults,
        })
      } catch (vaultError) {
        const errorLine: TerminalLine = {
          id: `error-${Date.now()}`,
          type: 'error',
          content: `Failed to load vaults: ${
            vaultError instanceof Error ? vaultError.message : 'Unknown error'
          }`,
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), errorLine])
        return
      }
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to check wallet balance: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
    }
  }

  const handleWalletSendList = async () => {
    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Loading wallets...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, loadingLine])

    try {
      const result = await getAllWallets()

      if (result.wallets.length === 0) {
        const emptyLine: TerminalLine = {
          id: `empty-${Date.now()}`,
          type: 'error',
          content: 'No wallets available. Create one with "wallet create".',
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), emptyLine])
        return
      }

      // Get balances for all wallets
      const walletsWithBalances = await Promise.all(
        result.wallets.map(async (wallet: WalletData) => {
          try {
            const balanceResult = await verbsApi.getWalletBalance(wallet.id)
            const usdcToken = balanceResult.balance.find(
              (token) => token.symbol === 'USDC',
            )
            const usdcBalance = usdcToken
              ? parseFloat(usdcToken.totalBalance)
              : 0
            return {
              ...wallet,
              usdcBalance,
            }
          } catch {
            return {
              ...wallet,
              usdcBalance: 0,
            }
          }
        }),
      )

      // Filter wallets with USDC > 0 and sort by balance (highest first)
      const walletsWithUSDC = walletsWithBalances
        .filter((wallet: any) => wallet.usdcBalance > 0)
        .sort((a: any, b: any) => b.usdcBalance - a.usdcBalance)

      if (walletsWithUSDC.length === 0) {
        const noBalanceLine: TerminalLine = {
          id: `no-balance-${Date.now()}`,
          type: 'error',
          content: 'No wallets have a USDC balance. Fund a wallet first.',
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), noBalanceLine])
        return
      }

      // Create wallet options list
      const walletOptions = walletsWithUSDC
        .map((wallet: any, index: number) => {
          const num = index + 1
          const numStr = num < 10 ? ` ${num}` : `${num}`
          const addressDisplay = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
          return `${numStr}. ${addressDisplay} - ${wallet.usdcBalance} USDC`
        })
        .join('\n')

      const walletSelectionLine: TerminalLine = {
        id: `wallet-send-selection-${Date.now()}`,
        type: 'output',
        content: `Select wallet to send from:\n\n${walletOptions}\n\nEnter wallet number:`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), walletSelectionLine])
      setPendingPrompt({
        type: 'walletSendSelection',
        message: '',
        data: walletsWithUSDC.map((w: any) => ({ id: w.id, address: w.address })),
      })
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to load wallets: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleWalletSendSelection = async (
    selection: number,
    wallets: WalletData[],
  ) => {
    setPendingPrompt(null)

    if (isNaN(selection) || selection < 1 || selection > wallets.length) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Invalid selection. Please enter a number between 1 and ${wallets.length}.`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    const selectedWallet = wallets[selection - 1]

    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Loading wallet balance...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, loadingLine])

    try {
      const result = await verbsApi.getWalletBalance(selectedWallet.id)
      const usdcToken = result.balance.find((token) => token.symbol === 'USDC')
      const usdcBalance = usdcToken ? parseFloat(usdcToken.totalBalance) : 0

      const balanceInfoLine: TerminalLine = {
        id: `balance-info-${Date.now()}`,
        type: 'success',
        content: `Wallet ${shortenAddress(selectedWallet.address)} has ${usdcBalance} USDC available.\n\nEnter amount to send:`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), balanceInfoLine])

      setPendingPrompt({
        type: 'walletSendAmount',
        message: '',
        data: { selectedWallet, balance: usdcBalance },
      })
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to fetch wallet balance: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleWalletSendAmount = async (
    amount: number,
    data: { selectedWallet: WalletData; balance: number },
  ) => {
    setPendingPrompt(null)

    if (isNaN(amount) || amount <= 0) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: 'Invalid amount. Please enter a positive number.',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    if (amount > data.balance) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Insufficient balance. Available: ${data.balance} USDC`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    const amountConfirmLine: TerminalLine = {
      id: `amount-confirm-${Date.now()}`,
      type: 'output',
      content: `Sending ${amount} USDC from ${shortenAddress(data.selectedWallet.address)}.\n\nEnter recipient address:`,
      timestamp: new Date(),
    }
    setLines((prev) => [...prev, amountConfirmLine])

    setPendingPrompt({
      type: 'walletSendRecipient',
      message: '',
      data: { ...data, amount },
    })
  }

  const handleWalletSendRecipient = async (
    recipientAddress: string,
    data: { selectedWallet: WalletData; balance: number; amount: number },
  ) => {
    setPendingPrompt(null)

    // Basic address validation
    if (
      !recipientAddress ||
      !recipientAddress.startsWith('0x') ||
      recipientAddress.length !== 42
    ) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content:
          'Invalid address. Please enter a valid Ethereum address (0x...).',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    const sendingLine: TerminalLine = {
      id: `sending-${Date.now()}`,
      type: 'output',
      content: `Sending ${data.amount} USDC to ${shortenAddress(recipientAddress)}...`,
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, sendingLine])

    try {
      const result = await verbsApi.sendTokens(
        data.selectedWallet.id,
        data.amount,
        recipientAddress,
      )

      const successLine: TerminalLine = {
        id: `send-success-${Date.now()}`,
        type: 'success',
        content: `Transaction created successfully!\n\nTo: ${result.transaction.to}\nValue: ${result.transaction.value}\nData: ${result.transaction.data.slice(0, 20)}...\n\nTransaction ready to be signed and sent.`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), successLine])
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle special keys for lend prompts
    if (pendingPrompt && pendingPrompt.type === 'lendVault') {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleLendVaultSelection((pendingPrompt.data as VaultData[]) || [])
        return
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setPendingPrompt(null)
        setCurrentInput('')
        return
      }
      // Prevent other input for lend prompts
      e.preventDefault()
      return
    }

    // Handle ESC key for lend amount prompt
    if (pendingPrompt && pendingPrompt.type === 'lendAmount') {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPendingPrompt(null)
        setCurrentInput('')
        return
      }
    }

    if (e.key === 'Enter') {
      processCommand(currentInput)
      setCurrentInput('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex =
          historyIndex === -1
            ? commandHistory.length - 1
            : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setCurrentInput(commandHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1)
          setCurrentInput('')
        } else {
          setHistoryIndex(newIndex)
          setCurrentInput(commandHistory[newIndex])
        }
      }
    }
  }

  const handleClick = () => {
    // Don't refocus if user is selecting text
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) {
      return
    }

    // Don't refocus if click is on selected text
    if (selection && !selection.isCollapsed) {
      return
    }

    if (inputRef.current) {
      inputRef.current.focus()
    }
  }

  return (
    <div
      className="w-full h-full flex flex-col bg-terminal-bg shadow-terminal-inner cursor-text"
      onClick={handleClick}
    >
      <NavBar fullWidth />

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-4 pt-20 space-y-1 scrollbar-thin scrollbar-thumb-terminal-border scrollbar-track-transparent"
      >
        {lines.map((line) => (
          <div
            key={line.id}
            className={line.id === 'welcome-ascii' ? '' : 'terminal-line'}
          >
            <div
              className={
                line.id === 'welcome-ascii'
                  ? ''
                  : `terminal-output ${
                      line.type === 'error'
                        ? 'terminal-error'
                        : line.type === 'success'
                          ? 'terminal-success'
                          : line.type === 'warning'
                            ? 'terminal-warning'
                            : line.type === 'input'
                              ? 'text-terminal-muted'
                              : 'terminal-output'
                    }`
              }
              style={
                line.id === 'welcome-ascii'
                  ? {
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
                      color: '#b8bb26',
                      whiteSpace: 'pre',
                      lineHeight: '0.75',
                      letterSpacing: '0',
                      fontVariantLigatures: 'none',
                      fontFeatureSettings: '"liga" 0',
                      margin: 0,
                      padding: 0,
                      border: 'none',
                    }
                  : {}
              }
            >
              {renderContentWithLinks(line.content)}
            </div>
          </div>
        ))}

        {/* Current Input Line */}
        <div className="terminal-line">
          <span className="terminal-prompt">
            {pendingPrompt
              ? pendingPrompt.message
              : selectedWallet
                ? `verbs (${shortenAddress(selectedWallet.address)}): $`
                : 'verbs: $'}
          </span>
          <div className="flex-1 flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-transparent outline-none text-terminal-text caret-transparent flex-shrink-0"
              style={{ width: `${Math.max(1, currentInput.length)}ch` }}
              autoComplete="off"
              spellCheck="false"
            />
            <span className="terminal-cursor ml-0"></span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Terminal
