import { chainById } from '@eth-optimism/viem/chains'

// polyfill required by privy sdk: https://docs.privy.io/basics/react-native/installation#configure-polyfills
import { Buffer } from 'buffer'
if (!globalThis.Buffer) globalThis.Buffer = Buffer

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  useWallets,
  usePrivy,
  type WalletWithMetadata,
  useUser as usePrivyUser,
  useSessionSigners,
  useUser,
} from '@privy-io/react-auth'
import type {
  CreateWalletResponse,
  GetAllWalletsResponse,
  WalletData,
} from '@eth-optimism/actions-service'
import NavBar from './nav/NavBar'
import { PrivyAuthButton } from './PrivyAuthButton'
import { actionsApi } from '../api/actionsApi'
import type { Address } from 'viem'
import { env } from '../envVars'
interface TerminalLine {
  id: string
  type: 'input' | 'output' | 'error' | 'success' | 'warning'
  content: string
  timestamp: Date
}

interface MarketData {
  marketId: {
    chainId: number
    address: Address
  }
  name: string
  asset: {
    address: Record<number, string>
    metadata: {
      symbol: string
      name: string
      decimals: number
    }
    type: string
  }
  supply: {
    totalAssets: string
    totalShares: string
  }
  apy: {
    total: number
    native: number
    totalRewards: number
    performanceFee: number
    usdc?: number
    morpho?: number
    other?: number
  }
  metadata: {
    owner: string
    curator: string
    fee: number
    lastUpdate: number
  }
  operationType?: 'open' | 'close'
  walletBalance?: number
}

interface PendingPrompt {
  type:
    | 'userId'
    | 'lendPositionType'
    | 'lendMarket'
    | 'lendAmount'
    | 'walletSendSelection'
    | 'walletSendAmount'
    | 'walletSendRecipient'
    | 'walletSelectSelection'
  message: string
  data?:
    | MarketData[]
    | WalletData[]
    | {
        selectedWallet?: WalletData
        selectedMarket?: MarketData
        walletBalance?: number
        marketBalance?: number
        balance?: number
        amount?: number
        operationType?: 'open' | 'close'
        hasMarketPositions?: boolean
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
         balance - Show selected wallet funds
         lend    - Lend and earn
         send    - Send to another address

Future actions (coming soon):
  borrow        - Borrow assets
  swap          - Trade tokens
  `

const Terminal = () => {
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null)
  const [screenWidth, setScreenWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  )
  const [currentWalletList, setCurrentWalletList] = useState<
    GetAllWalletsResponse['wallets'] | null
  >(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

  const { authenticated: isSignedIn, getAccessToken } = usePrivy()
  const { user } = useUser()
  const getAuthHeaders = useCallback(async () => {
    const token = await getAccessToken()
    return token ? { Authorization: `Bearer ${token}` } : undefined
  }, [getAccessToken])

  // Privy wallet hooks
  const { wallets } = useWallets()
  const { authenticated: privyAuthenticated } = usePrivy()
  const { user: privyUser } = usePrivyUser()
  const { addSessionSigners } = useSessionSigners()
  const ethereumEmbeddedWallets = useMemo<WalletWithMetadata[]>(
    () =>
      (privyUser?.linkedAccounts?.filter(
        (account) =>
          account.type === 'wallet' &&
          account.walletClientType === 'privy' &&
          account.chainType === 'ethereum',
      ) as WalletWithMetadata[]) ?? [],
    [privyUser],
  )

  const [selectedMarketIndex, setSelectedMarketIndex] = useState(0)
  const [selectedPositionTypeIndex, setSelectedPositionTypeIndex] = useState(0)

  // Auto-select wallet when Privy is authenticated and has wallets
  useEffect(() => {
    const autoSelectWallet = async () => {
      if (
        isSignedIn &&
        privyAuthenticated &&
        wallets.length > 0 &&
        !selectedWallet
      ) {
        // Use the first available embedded wallet
        const embeddedWallet = wallets.find(
          (wallet) => wallet.walletClientType === 'privy',
        )
        if (embeddedWallet) {
          const walletAddress = embeddedWallet.address

          setSelectedWallet({
            id: user?.id || 'unknown',
            address: walletAddress as `0x${string}`,
          })

          // Add a success message to the terminal
          const welcomeLine: TerminalLine = {
            id: `welcome-${Date.now()}`,
            type: 'success',
            content: `Welcome back ${user?.email?.address || user?.id}!\nWallet auto-selected: ${walletAddress}`,
            timestamp: new Date(),
          }
          setLines((prev) => [...prev, welcomeLine])
        }
      }
    }

    autoSelectWallet()
  }, [isSignedIn, privyAuthenticated, wallets.length, selectedWallet, user])

  // Function to render content with clickable links and colored commands
  const renderContentWithLinks = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g

    // Color mappings for wallet commands (rainbow order)
    const colorMap: Record<string, string> = {
      // Console commands - blue
      help: '#83a598',
      clear: '#83a598',
      status: '#83a598',
      exit: '#83a598',
      // Future actions - red
      borrow: '#fb4933',
      swap: '#fb4933',
      // Wallet commands - rainbow
      create: '#fb4933', // red
      select: '#fe8019', // orange
      fund: '#fabd2f', // yellow
      balance: '#b8bb26', // green
      lend: '#83a598', // blue
      send: '#d3869b', // purple
    }

    // Build regex pattern for colored commands
    const commandPattern = Object.keys(colorMap).join('|')
    const commandRegex = new RegExp(`\\b(${commandPattern})\\b`, 'g')

    const urlParts = content.split(urlRegex)

    return urlParts.map((part, index) => {
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

      // Check if this part contains colored commands
      const segments: React.ReactNode[] = []
      let lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = commandRegex.exec(part)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          segments.push(part.substring(lastIndex, match.index))
        }

        // Add colored command
        const command = match[0]
        segments.push(
          <span
            key={`${index}-${match.index}`}
            style={{ color: colorMap[command] }}
          >
            {command}
          </span>,
        )

        lastIndex = match.index + command.length
      }

      // Add remaining text
      if (lastIndex < part.length) {
        segments.push(part.substring(lastIndex))
      }

      return segments.length > 0 ? <span key={index}>{segments}</span> : part
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
  const displayWalletBalance = async (
    walletId: string,
    showMarketPositions: boolean = true,
  ): Promise<string> => {
    const result = await actionsApi.getWalletBalance(
      walletId,
      await getAuthHeaders(),
    )

    const balancesByChain = result.balance.reduce(
      (acc, token) => {
        token.chainBalances.forEach(
          ({ chainId, balance, formattedBalance }) => {
            if (!acc[chainId]) {
              acc[chainId] = []
            }
            acc[chainId].push({
              ...token,
              totalBalance: balance,
              totalFormattedBalance: formattedBalance,
            })
          },
        )
        return acc
      },
      {} as Record<number, typeof result.balance>,
    )

    const balanceLines: string[] = []

    // Iterate over each chain and format balances
    for (const [chainId, tokens] of Object.entries(balancesByChain)) {
      balanceLines.push(`Chain: ${chainById[Number(chainId)].name}`)

      // Show ETH, USDC, and any market balances
      const filteredBalances = tokens.filter(
        (token) =>
          token.symbol === 'ETH' ||
          token.symbol === 'USDC' ||
          token.symbol === 'USDC_DEMO' ||
          token.symbol.includes('Gauntlet') ||
          token.symbol.includes('Market'),
      )

      // Ensure both ETH and USDC are shown, even if not in response
      const ethBalance = filteredBalances.find(
        (token) => token.symbol === 'ETH',
      )
      const usdcBalance = filteredBalances.find(
        (token) => token.symbol === 'USDC',
      )
      const usdcDemoBalance = filteredBalances.find(
        (token) => token.symbol === 'USDC_DEMO',
      )

      // Separate market balances from token balances
      const marketBalances = filteredBalances.filter(
        (token) =>
          token.symbol !== 'ETH' &&
          token.symbol !== 'USDC' &&
          token.symbol !== 'USDC_DEMO',
      )

      balanceLines.push(
        `  ETH: ${ethBalance ? formatBalance(ethBalance.totalBalance, 18) : '0'}`,
        `  USDC: ${usdcBalance ? formatBalance(usdcBalance.totalBalance, 6) : '0'}`,
        `  USDC_DEMO: ${usdcDemoBalance ? formatBalance(usdcDemoBalance.totalBalance, 6) : '0'}`,
      )

      // Add market balances if any exist and showMarketPositions is true
      if (showMarketPositions && marketBalances.length > 0) {
        balanceLines.push('  Market Positions:')
        marketBalances.forEach((market) => {
          balanceLines.push(
            `    ${market.symbol}: ${formatBalance(market.totalBalance, 6)}`,
          ) // Assume 6 decimals for market shares
        })
      }

      balanceLines.push('') // Add a blank line between chains
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
          line.content.includes('Select a wallet:'),
        )

        if (walletSelectIndex !== -1) {
          const formatWalletColumns = (
            wallets: GetAllWalletsResponse['wallets'],
          ) => {
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
            content: `Select a wallet:\n\n${walletOptions}\n\nEnter wallet number:`,
          }

          return [
            ...prev.slice(0, walletSelectIndex),
            updatedLine,
            ...prev.slice(walletSelectIndex + 1),
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
      const actionsAscii = `
    █████████             █████     ███
   ███░░░░░███           ░░███     ░░░
  ░███    ░███   ██████  ███████   ████   ██████  ████████    █████
  ░███████████  ███░░███░░░███░   ░░███  ███░░███░░███░░███  ███░░
  ░███░░░░░███ ░███ ░░░   ░███     ░███ ░███ ░███ ░███ ░███ ░░█████
  ░███    ░███ ░███  ███  ░███ ███ ░███ ░███ ░███ ░███ ░███  ░░░░███
  █████   █████░░██████   ░░█████  █████░░██████  ████ █████ ██████
 ░░░░░   ░░░░░  ░░░░░░     ░░░░░  ░░░░░  ░░░░░░  ░░░░ ░░░░░ ░░░░░░
     `
      const welcomeLines: TerminalLine[] = [
        {
          id: 'welcome-ascii',
          type: 'success',
          content: actionsAscii,
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
          content: 'DeFi Library for the OP Stack',
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
          content: 'actions: $ help',
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
    return actionsApi.createWallet(userId)
  }

  const getAllWallets = async (): Promise<GetAllWalletsResponse> => {
    return actionsApi.getAllWallets()
  }

  const addSessionSigner = useCallback(
    async (walletAddress: string) => {
      if (!env.VITE_SESSION_SIGNER_ID) {
        console.error('SESSION_SIGNER_ID must be defined to addSessionSigner')
        return
      }
      console.log(
        'Adding session signer for wallet:',
        env.VITE_SESSION_SIGNER_ID,
      )
      console.log('wallet address', walletAddress)

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
        console.log('error stack', (error as Error).stack)
      }
    },
    [addSessionSigners],
  )

  useEffect(() => {
    const undelegatedEthereumEmbeddedWallets = ethereumEmbeddedWallets.filter(
      (wallet) => wallet.delegated !== true,
    )
    undelegatedEthereumEmbeddedWallets.forEach((wallet) => {
      addSessionSigner(wallet.address)
    })
  }, [ethereumEmbeddedWallets])

  const processCommand = (command: string) => {
    const trimmed = command.trim()
    if (!trimmed) return

    // Handle pending prompts
    if (pendingPrompt) {
      if (pendingPrompt.type === 'userId') {
        handleWalletCreation(trimmed)
        return
      } else if (pendingPrompt.type === 'lendPositionType') {
        handlePositionTypeSelection()
        return
      } else if (pendingPrompt.type === 'lendMarket') {
        handleLendMarketSelection((pendingPrompt.data as MarketData[]) || [])
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
      }
    }

    // Add command to history
    setCommandHistory((prev) => [...prev, trimmed])
    setHistoryIndex(-1)

    // Add the command line to display
    const commandLine: TerminalLine = {
      id: `cmd-${Date.now()}`,
      type: 'input',
      content: `actions: $ ${trimmed}`,
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
        setLines((prev) => [...prev, commandLine])
        if (isSignedIn) {
          const warningLine: TerminalLine = {
            id: `wallet-create-disabled-${Date.now()}`,
            type: 'warning',
            content:
              'Wallet creation is disabled while you are logged in. Please log out to use this command. While logged in, the embedded wallet associated with your user account is used.',
            timestamp: new Date(),
          }
          setLines((prev) => [...prev, warningLine])
          return
        }
        setPendingPrompt({
          type: 'userId',
          message: 'Enter unique userId:',
        })
        return
      case 'wallet select':
      case 'select':
        setLines((prev) => [...prev, commandLine])
        if (isSignedIn) {
          const warningLine: TerminalLine = {
            id: `wallet-select-disabled-${Date.now()}`,
            type: 'warning',
            content:
              'Wallet selection is disabled while you are logged in. Please log out to use this command. While logged in, the embedded wallet associated with your user account is used.',
            timestamp: new Date(),
          }
          setLines((prev) => [...prev, warningLine])
          return
        }
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
Privy Address: ${result.privyAddress}
Smart Wallet Address: ${result.smartWalletAddress}
User ID: ${result.userId}`,
        timestamp: new Date(),
      }

      // Auto-select the newly created wallet
      try {
        const all = await getAllWallets()
        const created = all.wallets.find(
          (w) =>
            w.address.toLowerCase() ===
              (result.smartWalletAddress || '').toLowerCase() ||
            w.address.toLowerCase() ===
              (result.privyAddress || '').toLowerCase(),
        )

        const walletToSelect = created || all.wallets[all.wallets.length - 1]
        if (walletToSelect) {
          setSelectedWallet(walletToSelect)
        }
      } catch {
        // ignore selection errors silently
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

  const handlePositionTypeSelection = async () => {
    const operationType: 'open' | 'close' =
      selectedPositionTypeIndex === 0 ? 'open' : 'close'
    const promptData = pendingPrompt?.data as {
      selectedWallet: WalletData
      selectedMarket: MarketData
      walletBalance: number
      marketBalance: number
    }
    setPendingPrompt(null)

    const balanceToUse =
      operationType === 'close'
        ? promptData.marketBalance
        : promptData.walletBalance
    const actionText = operationType === 'close' ? 'withdraw' : 'deposit'

    const amountPromptLine: TerminalLine = {
      id: `amount-prompt-${Date.now()}`,
      type: 'output',
      content: `How much would you like to ${actionText}?`,
      timestamp: new Date(),
    }

    setLines((prev) => [...prev.slice(0, -1), amountPromptLine])

    setPendingPrompt({
      type: 'lendAmount',
      message: '',
      data: {
        selectedWallet: promptData.selectedWallet,
        selectedMarket: promptData.selectedMarket,
        walletBalance: promptData.walletBalance,
        marketBalance: promptData.marketBalance,
        balance: balanceToUse,
        operationType,
      },
    })
  }

  const handleLendMarketSelection = async (markets: MarketData[]) => {
    const selectedMarket = markets[selectedMarketIndex]
    setPendingPrompt(null)

    console.log(
      '[FRONTEND] Selected market:',
      selectedMarket.name,
      selectedMarket.marketId.address,
    )

    try {
      const market = selectedMarket
      console.log('market', market)

      const nameValue = market.name
      const netApyValue = `${(market.apy.total * 100).toFixed(2)}%`
      const totalAssetsValue = `$${(parseFloat(market.supply.totalAssets) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      const feeValue = `${(market.metadata.fee * 100).toFixed(1)}%`
      const managerValue = 'Gauntlet'

      const nativeApyValue = `${(market.apy.native * 100).toFixed(2)}%`
      const usdcRewardsValue =
        market.apy.usdc !== undefined
          ? `${(market.apy.usdc * 100).toFixed(2)}%`
          : 'N/A'
      const morphoRewardsValue =
        market.apy.morpho !== undefined
          ? `${(market.apy.morpho * 100).toFixed(2)}%`
          : 'N/A'
      const feeImpactValue = `${(market.apy.native * market.apy.performanceFee * 100).toFixed(2)}%`

      const marketInfoTable = `
┌─────────────────────────────────────────────────────────────┐
│                     VAULT INFORMATION                       │
├─────────────────────────────────────────────────────────────┤
│ Name:              ${nameValue.padEnd(40)} │
│ Net APY:           ${netApyValue.padEnd(40)} │
│                                                             │
│ APY BREAKDOWN:                                              │
│   Native APY:      ${nativeApyValue.padEnd(40)} │
│   USDC Rewards:    ${usdcRewardsValue.padEnd(40)} │
│   MORPHO Rewards:  ${morphoRewardsValue.padEnd(40)} │
│   Performance Fee: ${feeImpactValue.padEnd(40)} │
│                                                             │
│ Total Assets:      ${totalAssetsValue.padEnd(40)} │
│ Management Fee:    ${feeValue.padEnd(40)} │
│ Manager:           ${managerValue.padEnd(40)} │
└─────────────────────────────────────────────────────────────┘`

      const marketInfoLine: TerminalLine = {
        id: `market-info-${Date.now()}`,
        type: 'success',
        content: marketInfoTable,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), marketInfoLine])

      const loadingBalanceLine: TerminalLine = {
        id: `loading-balance-${Date.now()}`,
        type: 'output',
        content: 'Loading balance...',
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, loadingBalanceLine])

      const walletBalanceText = await displayWalletBalance(
        selectedWallet!.id,
        true,
      )

      const walletBalanceResult = await actionsApi.getWalletBalance(
        selectedWallet!.id,
        await getAuthHeaders(),
      )
      const assetAddress =
        selectedMarket.asset.address[selectedMarket.marketId.chainId] ||
        Object.values(selectedMarket.asset.address)[0]

      const chainToken = walletBalanceResult.balance
        .flatMap((t) => t.chainBalances.map((cb) => ({ ...cb })))
        .find(
          (cb) =>
            cb.chainId === selectedMarket.marketId.chainId &&
            (cb.tokenAddress || '').toLowerCase() ===
              assetAddress.toLowerCase(),
        )

      const usdcBalance = chainToken
        ? parseFloat(chainToken.formattedBalance)
        : 0

      console.log('[FRONTEND] Wallet USDC balance:', usdcBalance)

      // Get market shares from existing wallet balance data
      const marketToken = walletBalanceResult.balance.find(
        (token) =>
          token.symbol === selectedMarket.name &&
          token.chainBalances.some(
            (cb) => cb.chainId === selectedMarket.marketId.chainId,
          ),
      )
      const marketChainBalance = marketToken?.chainBalances.find(
        (cb) => cb.chainId === selectedMarket.marketId.chainId,
      )
      const marketShares = marketChainBalance
        ? parseFloat(marketChainBalance.formattedBalance)
        : 0

      console.log('[FRONTEND] Market shares from wallet balance:', marketShares)

      // If market has shares, ask open or close
      if (marketShares > 0) {
        // Show balances first
        const balancesLine: TerminalLine = {
          id: `balances-${Date.now()}`,
          type: 'output',
          content: `Wallet Balance:\n${walletBalanceText}\n\nMarket Position: ${marketShares} ${selectedMarket.name}`,
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), balancesLine])

        const positionTypes = [
          'open position (deposit)',
          'close position (withdraw)',
        ]
        const positionTypeOptions = positionTypes
          .map((type, index) => `${index === 0 ? '> ' : '  '}${type}`)
          .join('\n')

        const positionTypeSelectionLine: TerminalLine = {
          id: `position-type-selection-${Date.now()}`,
          type: 'output',
          content: `Would you like to lend more or close a position?\n\n${positionTypeOptions}\n\n[Enter] to select, [↑/↓] to navigate`,
          timestamp: new Date(),
        }

        setLines((prev) => [...prev, positionTypeSelectionLine])
        setSelectedPositionTypeIndex(0)
        setPendingPrompt({
          type: 'lendPositionType',
          message: '',
          data: {
            selectedWallet: selectedWallet!,
            selectedMarket: selectedMarket,
            walletBalance: usdcBalance,
            marketBalance: marketShares,
          },
        })
        return
      }

      // No market position, go directly to lend amount
      const balancesDisplay = `Wallet Balance:\n${walletBalanceText}\n\nHow much would you like to lend?`

      const balancesLine: TerminalLine = {
        id: `balances-${Date.now()}`,
        type: 'output',
        content: balancesDisplay,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), balancesLine])

      setPendingPrompt({
        type: 'lendAmount',
        message: '',
        data: {
          selectedWallet: selectedWallet!,
          selectedMarket: selectedMarket,
          walletBalance: usdcBalance,
          marketBalance: marketShares,
          balance: usdcBalance,
          operationType: 'open',
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
      selectedMarket: MarketData
      walletBalance: number
      marketBalance?: number
      operationType?: 'open' | 'close'
    }

    const operationType = promptData.operationType || 'open'
    const relevantBalance =
      operationType === 'close'
        ? promptData.marketBalance || 0
        : promptData.walletBalance

    setPendingPrompt(null)

    console.log(
      '[FRONTEND] Amount submitted:',
      amount,
      'Operation:',
      operationType,
    )

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

    if (amount > relevantBalance) {
      const balanceUnit =
        operationType === 'close' ? promptData.selectedMarket.name : 'USDC'
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Insufficient balance. You have ${relevantBalance} ${balanceUnit} available.`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, errorLine])
      return
    }

    const assetSymbol = promptData.selectedMarket.asset.metadata.symbol
    const amountUnit = operationType === 'close' ? assetSymbol : assetSymbol
    const processingLine: TerminalLine = {
      id: `processing-${Date.now()}`,
      type: 'output',
      content:
        operationType === 'close'
          ? `Processing withdrawal: ${amount} ${amountUnit} from ${promptData.selectedMarket.name}...`
          : `Processing lending transaction: ${amount} ${amountUnit} to ${promptData.selectedMarket.name}...`,
      timestamp: new Date(),
    }
    setLines((prev) => [...prev, processingLine])

    try {
      console.log(
        `[FRONTEND] Calling ${operationType === 'close' ? 'closeLendPosition' : 'openLendPosition'} API`,
      )

      const assetAddress =
        promptData.selectedMarket.asset.address[
          promptData.selectedMarket.marketId.chainId
        ] ||
        (Object.values(promptData.selectedMarket.asset.address)[0] as Address)

      const result =
        operationType === 'close'
          ? await actionsApi.closeLendPosition(
              promptData.selectedWallet.id,
              amount,
              assetAddress as Address,
              promptData.selectedMarket.marketId,
              await getAuthHeaders(),
            )
          : await actionsApi.openLendPosition(
              promptData.selectedWallet.id,
              amount,
              assetAddress as Address,
              promptData.selectedMarket.marketId,
              await getAuthHeaders(),
            )

      console.log(
        `[FRONTEND] ${operationType === 'close' ? 'Withdrawal' : 'Deposit'} successful:`,
        result.transaction.blockExplorerUrls,
      )

      const successLine: TerminalLine = {
        id: `lend-success-${Date.now()}`,
        type: 'success',
        content:
          operationType === 'close'
            ? `✅ Successfully withdrew ${amount} ${amountUnit}!\n\nMarket:  ${promptData.selectedMarket.name}\nAmount: ${amount} ${amountUnit}\nTx:     ${result.transaction.blockExplorerUrls.join('\n') || 'pending'}`
            : `✅ Successfully lent ${amount} ${amountUnit} to ${promptData.selectedMarket.name}!\n\nMarket:  ${promptData.selectedMarket.name}\nAmount: ${amount} ${amountUnit}\nTx:     ${result.transaction.blockExplorerUrls.join('\n') || 'pending'}`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), successLine])
    } catch (error) {
      console.error(
        `[FRONTEND] ${operationType === 'close' ? 'Withdrawal' : 'Lending'} failed:`,
        error,
      )
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to ${operationType === 'close' ? 'withdraw' : 'lend'}: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
      console.log(result)

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
      const formatWalletColumns = (
        wallets: GetAllWalletsResponse['wallets'],
      ) => {
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
      console.log(error)
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
        const balanceText = await displayWalletBalance(
          selectedWalletData.id,
          true,
        )

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

    // Inform user of default funding behavior (100 USDC) and proceed
    const fundingInfo: TerminalLine = {
      id: `funding-info-${Date.now()}`,
      type: 'output',
      content: 'Funding selected wallet with 100 USDC...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, fundingInfo])

    try {
      const { amount } = await actionsApi.fundWallet(
        selectedWallet.id,
        await getAuthHeaders(),
      )

      const fundSuccessLine: TerminalLine = {
        id: `fund-success-${Date.now()}`,
        type: 'success',
        content: `Wallet funded with ${amount} USDC successfully! Fetching updated balance...`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, fundSuccessLine])

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
      setLines((prev) => [...prev, errorLine])
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

    // Load markets immediately
    const loadingLine: TerminalLine = {
      id: `loading-${Date.now()}`,
      type: 'output',
      content: 'Loading markets...',
      timestamp: new Date(),
    }
    setLines((prev) => [...prev, loadingLine])

    try {
      const result = await actionsApi.getMarkets()

      if (result.markets.length === 0) {
        const emptyLine: TerminalLine = {
          id: `empty-${Date.now()}`,
          type: 'error',
          content: 'No markets available.',
          timestamp: new Date(),
        }
        setLines((prev) => [...prev.slice(0, -1), emptyLine])
        return
      }

      const marketOptions = result.markets
        .map(
          (market, index) =>
            `${index === 0 ? '> ' : '  '}${market.name} - ${(market.apy.total * 100).toFixed(2)}% APY`,
        )
        .join('\n')

      const marketSelectionLine: TerminalLine = {
        id: `market-selection-${Date.now()}`,
        type: 'output',
        content: `Select a Lending market:\n\n${marketOptions}\n\n[Enter] to select, [↑/↓] to navigate`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), marketSelectionLine])
      setPendingPrompt({
        type: 'lendMarket',
        message: '',
        data: result.markets,
      })
      setSelectedMarketIndex(0)
    } catch (marketError) {
      const errorLine: TerminalLine = {
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to load markets: ${
          marketError instanceof Error ? marketError.message : 'Unknown error'
        }`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev.slice(0, -1), errorLine])
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
            const balanceResult = await actionsApi.getWalletBalance(
              wallet.id,
              await getAuthHeaders(),
            )
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
        .filter((wallet) => wallet.usdcBalance > 0)
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
        data: walletsWithUSDC.map((w) => ({
          id: w.id,
          address: w.address as Address,
        })),
      })
    } catch (error) {
      console.log(error)
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
      const result = await actionsApi.getWalletBalance(
        selectedWallet.id,
        await getAuthHeaders(),
      )
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
      const result = await actionsApi.sendTokens(
        data.selectedWallet.id,
        data.amount,
        recipientAddress,
        await getAuthHeaders(),
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
    // Handle special keys for position type selection
    if (pendingPrompt && pendingPrompt.type === 'lendPositionType') {
      if (e.key === 'Enter') {
        e.preventDefault()
        handlePositionTypeSelection()
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedPositionTypeIndex((prevIndex) => (prevIndex > 0 ? 0 : 1))
        return
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedPositionTypeIndex((prevIndex) => (prevIndex < 1 ? 1 : 0))
        return
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setPendingPrompt(null)
        setCurrentInput('')
        return
      }
      e.preventDefault()
      return
    }

    // Handle special keys for lend market prompts
    if (pendingPrompt && pendingPrompt.type === 'lendMarket') {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleLendMarketSelection((pendingPrompt.data as MarketData[]) || [])
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedMarketIndex((prevIndex) =>
          prevIndex > 0
            ? prevIndex - 1
            : (pendingPrompt.data as MarketData[]).length - 1,
        )
        return
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedMarketIndex((prevIndex) =>
          prevIndex < (pendingPrompt.data as MarketData[]).length - 1
            ? prevIndex + 1
            : 0,
        )
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

  // Update the position type selection display to reflect the current selection
  useEffect(() => {
    if (pendingPrompt?.type === 'lendPositionType') {
      const positionTypes = [
        'open position (deposit)',
        'close position (withdraw)',
      ]
      const positionTypeOptions = positionTypes
        .map(
          (type, index) =>
            `${index === selectedPositionTypeIndex ? '> ' : '  '}${type}`,
        )
        .join('\n')

      const positionTypeSelectionLine: TerminalLine = {
        id: `position-type-selection-${Date.now()}`,
        type: 'output',
        content: `Would you like to lend more or close a position?\n\n${positionTypeOptions}\n\n[Enter] to select, [↑/↓] to navigate`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), positionTypeSelectionLine])
    }
  }, [selectedPositionTypeIndex, pendingPrompt])

  // Update the market selection display to reflect the current selection
  useEffect(() => {
    if (pendingPrompt?.type === 'lendMarket') {
      const markets = pendingPrompt.data as MarketData[]
      const marketOptions = markets
        .map(
          (market, index) =>
            `${index === selectedMarketIndex ? '> ' : '  '}${market.name} - ${(market.apy.total * 100).toFixed(2)}% APY`,
        )
        .join('\n')

      const marketSelectionLine: TerminalLine = {
        id: `market-selection-${Date.now()}`,
        type: 'output',
        content: `Select a Lending market:\n\n${marketOptions}\n\n[Enter] to select, [↑/↓] to navigate`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), marketSelectionLine])
    }
  }, [selectedMarketIndex, pendingPrompt])

  return (
    <div
      className="w-full h-full flex flex-col shadow-terminal-inner cursor-text"
      style={{ backgroundColor: '#282828' }}
      onClick={handleClick}
    >
      <NavBar fullWidth responsiveLogo rightElement={<PrivyAuthButton />} />

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
                      color: '#FF0621',
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
                ? `actions (${shortenAddress(selectedWallet.address)}): $`
                : 'actions: $'}
          </span>
          <div className="flex-1 flex items-center">
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-transparent outline-hidden text-terminal-text caret-transparent flex-shrink-0"
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
