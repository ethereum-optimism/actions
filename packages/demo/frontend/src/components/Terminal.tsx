import { useState, useEffect, useRef } from 'react'
import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  WalletData,
} from '@eth-optimism/verbs-sdk'
import VerbsLogo from './VerbsLogo'
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
}

interface PendingPrompt {
  type:
    | 'userId'
    | 'lendVault'
    | 'walletSendSelection'
    | 'walletSendAmount'
    | 'walletSendRecipient'
    | 'walletSelectSelection'
  message: string
  data?: VaultData[] | WalletData[] | { selectedWallet: WalletData; balance: number; amount?: number }
}

const HELP_CONTENT = `
Console commands:
  help          - Show this help message
  clear         - Clear the terminal
  status        - Show system status
  exit          - Exit terminal

Wallet commands:
  wallet create  - Create a new wallet
  wallet select  - Select a wallet to use for commands
  wallet lend    - Lend to Morpho vaults
  wallet balance - Show balance of selected wallet
  wallet fund    - Fund selected wallet
  wallet send    - Send USDC to another address

Future verbs (coming soon):
  fund          - Onramp to stables
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
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

  // Helper function to shorten wallet addresses
  const shortenAddress = (address: string): string => {
    if (address.length <= 10) return address
    return `${address.slice(0, 6)}..${address.slice(-4)}`
  }

  // Focus input on mount and keep it focused
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

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
          pendingPrompt.data as { selectedWallet: WalletData; balance: number; amount: number },
        )
        return
      } else if (pendingPrompt.type === 'walletSelectSelection') {
        handleWalletSelectSelection(
          parseInt(trimmed),
          (pendingPrompt.data as WalletData[]) || [],
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
        setLines((prev) => [...prev, commandLine])
        handleWalletSelect()
        return
      case 'wallet balance': {
        setLines((prev) => [...prev, commandLine])
        handleWalletBalance()
        return
      }
      case 'wallet fund': {
        setLines((prev) => [...prev, commandLine])
        handleWalletFund()
        return
      }
      case 'wallet send': {
        setLines((prev) => [...prev, commandLine])
        handleWalletSendList()
        return
      }
      case 'wallet lend': {
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
      case 'fund':
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

    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Loading vault information...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, loadingLine])
    setPendingPrompt(null)

    try {
      const result = await verbsApi.getVault(selectedVault.address)
      const vault = result.vault

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

      // Show final success message since we already have the selected wallet
      const successLine: TerminalLine = {
        id: `lend-success-${Date.now()}`,
        type: 'success',
        content: `Selected vault ${vault.name} for wallet ${shortenAddress(selectedWallet!.address)}. Lending functionality coming soon!`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, successLine])
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to load vault information: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
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

      const walletOptions = result.wallets
        .map((wallet, index) => {
          const num = index + 1
          const numStr = num < 10 ? ` ${num}` : `${num}`
          const addressDisplay = `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
          return `${numStr}. ${addressDisplay}${selectedWallet?.id === wallet.id ? ' (selected)' : ''}`
        })
        .join('\n')

      const walletSelectionLine: TerminalLine = {
        id: `wallet-select-${Date.now()}`,
        type: 'output',
        content: `Select a wallet:\n\n${walletOptions}\n\nEnter wallet number:`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), walletSelectionLine])
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
      const selectWalletIndex = prev.findIndex(line => 
        line.content.includes('Select a wallet:')
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
      try {
        const result = await verbsApi.getWalletBalance(selectedWalletData.id)

        // Filter to show only ETH and USDC, exclude MORPHO
        const filteredBalances = result.balance.filter(
          (token) => token.symbol === 'ETH' || token.symbol === 'USDC'
        )

        // Ensure both ETH and USDC are shown, even if not in response
        const ethBalance = filteredBalances.find(token => token.symbol === 'ETH')
        const usdcBalance = filteredBalances.find(token => token.symbol === 'USDC')
        
        // Format balances to human readable format
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
        
        const balanceText = [
          `ETH: ${ethBalance ? formatBalance(ethBalance.totalBalance, 18) : '0'}`,
          `USDC: ${usdcBalance ? formatBalance(usdcBalance.totalBalance, 6) : '0'}`
        ].join('\n')

        const balanceLine: TerminalLine = {
          id: `balance-${Date.now()}`,
          type: 'output',
          content: `\n${balanceText}`,
          timestamp: new Date(),
        }
        setLines((prev) => [...prev, balanceLine])
      } catch (error) {
        // Silently fail balance fetch to not interrupt wallet selection flow
        console.error('Failed to fetch balance after wallet selection:', error)
      }
    }, 100)
  }

  const handleWalletBalance = async () => {
    if (!selectedWallet) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: 'No wallet selected. Use "wallet select" to choose a wallet first.',
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
      const result = await verbsApi.getWalletBalance(selectedWallet.id)

      // Filter to show only ETH and USDC, exclude MORPHO
      const filteredBalances = result.balance.filter(
        (token) => token.symbol === 'ETH' || token.symbol === 'USDC'
      )

      // Ensure both ETH and USDC are shown, even if not in response
      const ethBalance = filteredBalances.find(token => token.symbol === 'ETH')
      const usdcBalance = filteredBalances.find(token => token.symbol === 'USDC')
      
      // Format balances to human readable format
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
      
      const balanceText = [
        `ETH: ${ethBalance ? formatBalance(ethBalance.totalBalance, 18) : '0'}`,
        `USDC: ${usdcBalance ? formatBalance(usdcBalance.totalBalance, 6) : '0'}`
      ].join('\n')

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
        content: 'No wallet selected. Use "wallet select" to choose a wallet first.',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    const fundingLine: TerminalLine = {
      id: `funding-${Date.now()}`,
      type: 'output',
      content: 'Funding wallet with tokens...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, fundingLine])

    try {
      // First fund the wallet
      await verbsApi.fundWallet(selectedWallet.id)

      const fundSuccessLine: TerminalLine = {
        id: `fund-success-${Date.now()}`,
        type: 'success',
        content: 'Wallet funded successfully! Fetching updated balance...',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), fundSuccessLine])

      // Then fetch and show the balance
      const result = await verbsApi.getWalletBalance(selectedWallet.id)

      // Filter to show only ETH and USDC, exclude MORPHO
      const filteredBalances = result.balance.filter(
        (token) => token.symbol === 'ETH' || token.symbol === 'USDC'
      )

      // Ensure both ETH and USDC are shown, even if not in response
      const ethBalance = filteredBalances.find(token => token.symbol === 'ETH')
      const usdcBalance = filteredBalances.find(token => token.symbol === 'USDC')
      
      const balanceText = [
        `ETH: ${ethBalance ? ethBalance.totalBalance : '0'}`,
        `USDC: ${usdcBalance ? usdcBalance.totalBalance : '0'}`
      ].join('\n')

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
        content: 'No wallet selected. Use "wallet select" to choose a wallet first.',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    // Check if selected wallet has USDC balance before proceeding
    try {
      const balanceResult = await verbsApi.getWalletBalance(selectedWallet.id)
      const usdcToken = balanceResult.balance.find(token => token.symbol === 'USDC')
      const usdcBalance = usdcToken ? parseFloat(usdcToken.totalBalance) : 0

      if (usdcBalance <= 0) {
        const noBalanceLine: TerminalLine = {
          id: `no-balance-${Date.now()}`,
          type: 'error',
          content: 'Selected wallet has no USDC balance. Fund the wallet first.',
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
        result.wallets.map(async (wallet) => {
          try {
            const balanceResult = await verbsApi.getWalletBalance(wallet.id)
            const usdcToken = balanceResult.balance.find(token => token.symbol === 'USDC')
            const usdcBalance = usdcToken ? parseFloat(usdcToken.totalBalance) : 0
            return {
              ...wallet,
              usdcBalance
            }
          } catch {
            return {
              ...wallet,
              usdcBalance: 0,
            }
          }
        })
      )

      // Filter wallets with USDC > 0 and sort by balance (highest first)
      const walletsWithUSDC = walletsWithBalances
        .filter(wallet => wallet.usdcBalance > 0)
        .sort((a, b) => b.usdcBalance - a.usdcBalance)

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
        .map((wallet, index) => {
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
        data: walletsWithUSDC.map((w) => ({ id: w.id, address: w.address })),
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
      const usdcToken = result.balance.find(token => token.symbol === 'USDC')
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
    if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: 'Invalid address. Please enter a valid Ethereum address (0x...).',
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
    if (
      pendingPrompt &&
      pendingPrompt.type === 'lendVault'
    ) {
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
      {/* Terminal Header */}
      <div className="flex items-center justify-between p-4 border-b border-terminal-border bg-terminal-secondary">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => (window.location.href = '/')}
        >
          <VerbsLogo />
          <div className="text-terminal-muted text-sm hover:text-terminal-accent transition-colors">
            verbs-terminal
          </div>
        </div>
        <div className="text-terminal-dim text-xs">
          {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin scrollbar-thumb-terminal-border scrollbar-track-transparent"
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
              {line.content}
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
                : 'verbs: $'
            }
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
