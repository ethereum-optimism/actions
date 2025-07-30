import { useState, useEffect, useRef } from 'react'
import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  WalletData
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
  type: 'userId' | 'lendProvider' | 'lendVault' | 'walletSelection'
  message: string
  data?: VaultData[] | WalletData[]
}

const HELP_CONTENT = `Available commands:

Console commands:
  help          - Show this help message
  clear         - Clear the terminal
  status        - Show system status
  exit          - Exit terminal

Wallet commands:
  wallet create  - Create a new wallet
  wallet list    - List all wallets
  wallet lend    - Lend to Morpho vaults
  wallet balance - Show balance of wallet

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
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

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
██╗   ██╗ ███████╗ ██████╗  ██████╗  ███████╗
██║   ██║ ██╔════╝ ██╔══██╗ ██╔══██╗ ██╔════╝
██║   ██║ █████╗   ██████╔╝ ██████╔╝ ███████╗
╚██╗ ██╔╝ ██╔══╝   ██╔══██╗ ██╔══██╗ ╚════██║
 ╚████╔╝  ███████╗ ██║  ██║ ██████╔╝ ███████║
  ╚═══╝   ╚══════╝ ╚═╝  ╚═╝ ╚═════╝  ╚══════╝`

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
      } else if (pendingPrompt.type === 'lendProvider') {
        handleLendProviderSelection()
        return
      } else if (pendingPrompt.type === 'lendVault') {
        handleLendVaultSelection(pendingPrompt.data as VaultData[] || [])
        return
      } else if (pendingPrompt.type === 'walletSelection') {
        handleWalletSelection(parseInt(trimmed), pendingPrompt.data as WalletData[] || [])
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
      case 'wallet list':
        setLines((prev) => [...prev, commandLine])
        handleWalletList()
        return
      case 'wallet balance': {
        setLines((prev) => [...prev, commandLine])
        handleWalletBalanceList()
        return
      }
      case 'wallet lend': {
        setLines((prev) => [...prev, commandLine])
        // Show provider selection immediately
        const providerSelectionLine: TerminalLine = {
          id: `provider-selection-${Date.now()}`,
          type: 'output',
          content: `Select a Lend provider:

> Morpho

[Enter] to select`,
          timestamp: new Date(),
        }
        setLines((prev) => [...prev, providerSelectionLine])
        setPendingPrompt({
          type: 'lendProvider',
          message: '',
        })
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

  const handleWalletList = async () => {
    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Fetching wallets...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, loadingLine])

    try {
      const result = await getAllWallets()

      if (result.wallets.length === 0) {
        const emptyLine: TerminalLine = {
          id: `empty-${Date.now()}`,
          type: 'output',
          content: 'No wallets found. Create one with "wallet create".',
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), emptyLine])
        return
      }

      const walletList = result.wallets
        .map((wallet, index) => `${index + 1}. ${wallet.address}`)
        .join('\n')

      const successLine: TerminalLine = {
        id: `success-${Date.now()}`,
        type: 'success',
        content: `Found ${result.count} wallet(s):

${walletList}`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), successLine])
    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to fetch wallets: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), errorLine])
    }
  }

  const handleLendProviderSelection = async () => {
    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Loading vaults...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, loadingLine])
    setPendingPrompt(null)

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
        .map((vault, index) => `${index === 0 ? '> ' : '  '}${vault.name} - ${(vault.apy * 100).toFixed(2)}% APY`)
        .join('\n')

      const vaultSelectionLine: TerminalLine = {
        id: `vault-selection-${Date.now()}`,
        type: 'output',
        content: `Select a Lend vault:

${vaultOptions}

[Enter] to select`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), vaultSelectionLine])
      setPendingPrompt({
        type: 'lendVault',
        message: '',
        data: result.vaults,
      })

    } catch (error) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to load vaults: ${
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
      const nativeApyValue = vault.apyBreakdown ? `${(vault.apyBreakdown.nativeApy * 100).toFixed(2)}%` : 'N/A'
      const usdcRewardsValue = vault.apyBreakdown && vault.apyBreakdown.usdc !== undefined 
        ? `${(vault.apyBreakdown.usdc * 100).toFixed(2)}%` : 'N/A'
      const morphoRewardsValue = vault.apyBreakdown && vault.apyBreakdown.morpho !== undefined
        ? `${(vault.apyBreakdown.morpho * 100).toFixed(2)}%` : 'N/A'
      const feeImpactValue = vault.apyBreakdown ? `${((vault.apyBreakdown.nativeApy * vault.apyBreakdown.performanceFee) * 100).toFixed(2)}%` : 'N/A'

      const vaultInfoTable = `
┌────────────────────────────────────────────────────────────┐
│                      VAULT INFORMATION                     │
├────────────────────────────────────────────────────────────┤
│ Name:              ${nameValue.padEnd(39)} │
│ Net APY:           ${netApyValue.padEnd(39)} │
│                                                            │
│ APY BREAKDOWN:                                             │
│   Native APY:      ${nativeApyValue.padEnd(39)} │
│   USDC Rewards:    ${usdcRewardsValue.padEnd(39)} │
│   MORPHO Rewards:  ${morphoRewardsValue.padEnd(39)} │
│   Performance Fee: ${feeImpactValue.padEnd(39)} │
│                                                            │
│ Total Assets:      ${totalAssetsValue.padEnd(39)} │
│ Management Fee:    ${feeValue.padEnd(39)} │
│ Manager:           ${managerValue.padEnd(39)} │
└────────────────────────────────────────────────────────────┘

Wallet Balance: $0

You must use "wallet fund" before lending to this market.`

      const vaultInfoLine: TerminalLine = {
        id: `vault-info-${Date.now()}`,
        type: 'success',
        content: vaultInfoTable,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), vaultInfoLine])

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

  const handleWalletSelection = async (selection: number, wallets: WalletData[]) => {
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
      content: 'Fetching wallet balance...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, loadingLine])

    try {
      const result = await verbsApi.getWalletBalance(selectedWallet.id)
      
      const balanceText = result.balance.length > 0 
        ? result.balance.map(token => `${token.symbol}: ${token.totalBalance}`).join('\n')
        : 'No tokens found'

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

  const handleWalletBalanceList = async () => {
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
          content: 'No wallets available.',
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), emptyLine])
        return
      }

      const walletOptions = result.wallets
        .map((wallet, index) => `${index + 1}. ${wallet.address}`)
        .join('\n')

      const walletSelectionLine: TerminalLine = {
        id: `wallets-${Date.now()}`,
        type: 'output',
        content: `Select a wallet:\n\n${walletOptions}\n\nEnter wallet number:`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), walletSelectionLine])
      setPendingPrompt({
        type: 'walletSelection',
        message: '',
        data: result.wallets.map(w => ({ id: w.id, address: w.address }))
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle special keys for lend prompts
    if (pendingPrompt && (pendingPrompt.type === 'lendProvider' || pendingPrompt.type === 'lendVault')) {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (pendingPrompt.type === 'lendProvider') {
          handleLendProviderSelection()
        } else if (pendingPrompt.type === 'lendVault') {
          handleLendVaultSelection(pendingPrompt.data as VaultData[] || [])
        }
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
                      lineHeight: '1.0',
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
            {pendingPrompt ? pendingPrompt.message : 'verbs: $'}
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
