import { baseSepolia, chainById, unichain } from '@eth-optimism/viem/chains'

// polyfill required by privy sdk: https://docs.privy.io/basics/react-native/installation#configure-polyfills
import {Buffer} from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer

import { useState, useEffect, useRef } from 'react'
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { DynamicWidget } from "@dynamic-labs/sdk-react-core";
import { isEthereumWallet } from "@dynamic-labs/ethereum";
import type {
  WalletData,
} from '@eth-optimism/verbs-service'
import NavBar from './NavBar'
import { verbsApi } from '../api/verbsApi'
import { encodeFunctionData, formatUnits } from 'viem'
import { getVerbs } from '../config/verbs';
import { SUPPORTED_TOKENS, type LendTransaction, type SmartWallet, type SupportedChainId, type TokenBalance } from '@eth-optimism/verbs-sdk';
import { mintableErc20Abi } from '../abis/mintableErc20Abi';

interface TerminalLine {
  id: string
  type: 'input' | 'output' | 'error' | 'success' | 'warning'
  content: string
  timestamp: Date
}

interface VaultData {
  chainId: number
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
         lend    - Lend and earn
         send    - Send to another address
         sendtx  - Send a test transaction (connected wallet)

Future verbs (coming soon):
  borrow        - Borrow assets
  repay         - Repay a loan
  swap          - Trade tokens
  earn          - Earn DeFi yield`

const Terminal = () => {
  const { primaryWallet } = useDynamicContext();

  const [lines, setLines] = useState<TerminalLine[]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<SmartWallet | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

  const [selectedVaultIndex, setSelectedVaultIndex] = useState(0)

  useEffect(() => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      console.log('Wallet not connected or not EVM compatible')
      setSelectedWallet(null)
      return
    }

    const initializeVerbsWallet = async () => {
    const verbs = getVerbs()
    verbs.wallet.hostedWalletProvider.specialDynamicMethod()
    const verbsWallet = await verbs.wallet.hostedWalletToVerbsWallet({wallet: primaryWallet})
    const wallet = await verbs.wallet.getSmartWallet({
      signer: verbsWallet.signer,
      deploymentOwners: [verbsWallet.address],
    })
    setSelectedWallet(wallet)
    }
    initializeVerbsWallet()
  }, [primaryWallet])

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
  // const formatBalance = (balance: string, decimals: number): string => {
  //   const balanceBigInt = BigInt(balance)
  //   const divisor = BigInt(10 ** decimals)
  //   const wholePart = balanceBigInt / divisor
  //   const fractionalPart = balanceBigInt % divisor

  //   if (fractionalPart === 0n) {
  //     return wholePart.toString()
  //   }

  //   const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
  //   const trimmedFractional = fractionalStr.replace(/0+$/, '')

  //   if (trimmedFractional === '') {
  //     return wholePart.toString()
  //   }

  //   return `${wholePart}.${trimmedFractional}`
  // }

  // DRY function to display wallet balance with loading state
  const displayWalletBalance = async (
    wallet: SmartWallet,
    showVaultPositions: boolean = true,
  ): Promise<string> => {
   
    // For manual/backend wallets, use the original API call
    const result = await wallet.getBalance()
    const verbs = getVerbs()
    const vaults = await verbs.lend.getMarkets()
    const vaultBalances = await Promise.all(
      vaults.map(async (vault) => {
        try {
          const walletAddress = wallet.address
          const vaultBalance = await verbs.lend.getMarketBalance(
            {
              address: vault.address,
              chainId: vault.chainId as SupportedChainId,
            },
            walletAddress,
          )

          // Only include vaults with non-zero balances
          if (vaultBalance.balance > 0n) {
            // Create a TokenBalance object for the vault
            const formattedBalance = formatUnits(vaultBalance.balance, 6) // Assuming 6 decimals for vault shares
            return {
              symbol: `${vault.name}`,
              totalBalance: vaultBalance.balance,
              totalFormattedBalance: formattedBalance,
              chainBalances: [
                {
                  chainId: vaultBalance.chainId,
                  balance: vaultBalance.balance,
                  tokenAddress: vault.asset,
                  formattedBalance: formattedBalance,
                },
              ],
            } as TokenBalance
          }
          return null
        } catch (error) {
          console.error(error)
          return null
        }
      }),
    )
     // Filter out null values and add vault balances to token balances
     const validVaultBalances = vaultBalances.filter(
      (balance): balance is NonNullable<typeof balance> => balance !== null,
    )
    const allBalances = [...result, ...validVaultBalances]


    const balancesByChain = allBalances.reduce(
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
      {} as Record<number, typeof allBalances>,
    )

    const balanceLines: string[] = []

    // Iterate over each chain and format balances
    for (const [chainId, tokens] of Object.entries(balancesByChain)) {
      balanceLines.push(`Chain: ${chainById[Number(chainId)].name}`)

      // Show ETH, USDC, and any vault balances
      const filteredBalances = tokens.filter(
        (token) =>
          token.symbol === 'ETH' ||
          token.symbol === 'USDC' ||
          token.symbol === 'USDC_DEMO' ||
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
      const usdcDemoBalance = filteredBalances.find(
        (token) => token.symbol === 'USDC_DEMO',
      )

      // Separate vault balances from token balances
      const vaultBalances = filteredBalances.filter(
        (token) => token.symbol !== 'ETH' && token.symbol !== 'USDC' && token.symbol !== 'USDC_DEMO',
      )

      balanceLines.push(
        `  ETH: ${ethBalance ? ethBalance.totalFormattedBalance : '0'}`,
        `  USDC: ${usdcBalance ? usdcBalance.totalFormattedBalance : '0'}`,
        `  USDC_DEMO: ${usdcDemoBalance ? usdcDemoBalance.totalFormattedBalance : '0'}`,
      )

      // Add vault balances if any exist and showVaultPositions is true
      if (showVaultPositions && vaultBalances.length > 0) {
        balanceLines.push('  Vault Positions:')
        vaultBalances.forEach((vault) => {
          balanceLines.push(
            `    ${vault.symbol}: ${vault.totalFormattedBalance}`,
          ) // Assume 6 decimals for vault shares
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

  const processCommand = (command: string) => {
    const trimmed = command.trim()
    if (!trimmed) return

    // Handle pending prompts
    if (pendingPrompt) {
      if (pendingPrompt.type === 'lendVault') {
        handleLendVaultSelection((pendingPrompt.data as VaultData[]) || [])
        return
      } else if (pendingPrompt.type === 'lendAmount') {
        handleLendAmountSubmission(parseFloat(trimmed))
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

  const handleLendVaultSelection = async (vaults: VaultData[]) => {
    // Use the selectedVaultIndex to select the vault
    const selectedVault = vaults[selectedVaultIndex]
    setPendingPrompt(null)

    console.log(
      '[FRONTEND] Selected vault:',
      selectedVault.name,
      selectedVault.address,
    )

    try {
      // Use the vault data we already have to show vault information
      const vault = selectedVault
      console.log('vault', vault)

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
      const walletBalanceResult = await selectedWallet?.getBalance()

      const chainToken = walletBalanceResult?.reduce((acc, token) => {
        token.chainBalances.forEach((chainBalance) => {
          if (chainBalance.chainId === selectedVault.chainId && chainBalance.tokenAddress === selectedVault.asset) {
            acc.push({ ...chainBalance, symbol: token.symbol, totalBalance: chainBalance.balance, totalFormattedBalance: chainBalance.formattedBalance, chainBalances: [chainBalance] })
          }
        })
        return acc
      }, [] as TokenBalance[])
        .flatMap((t) => t.chainBalances.map((cb) => ({ ...cb })))
        .find(
          (cb) =>
            cb.chainId === selectedVault.chainId &&
            (cb.tokenAddress || '').toLowerCase() ===
              (selectedVault.asset || '').toLowerCase(),
        )

      // TODO: update this to not hardcode the decimals and read decimals from token info.
      const usdcBalance = chainToken ? parseFloat(chainToken.formattedBalance) : 0

      console.log('[FRONTEND] Wallet USDC balance:', usdcBalance)

      // Show balances and ask for lend amount
      const balancesDisplay = `Wallet Balance:
${walletBalanceResult?.map((token) => `${token.symbol}: ${token.totalFormattedBalance}`).join('\n')}

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
      const asset = SUPPORTED_TOKENS.find(
        (token) => token.address[promptData.selectedVault.chainId as SupportedChainId] === promptData.selectedVault.asset,
      )
      if (!asset) {
        throw new Error(`Asset not found for token address: ${promptData.selectedVault.asset}`)
      }
      console.log('[FRONTEND] Calling lendDeposit API')
      let lendTransaction: LendTransaction | undefined
      if (selectedWallet && 'lendExecute' in selectedWallet && typeof selectedWallet.lendExecute === 'function') {
       lendTransaction = await selectedWallet?.lendExecute(amount, asset, promptData.selectedVault.chainId)
      }

      if (!lendTransaction) {
        console.error('No lend transaction available')
        return
      }
      if (!lendTransaction.transactionData) {
        console.error('No transaction data available for execution')
      }
      const depositHash = lendTransaction.transactionData!.approval
    ? await selectedWallet?.sendBatch(
        [
          lendTransaction.transactionData!.approval,
          lendTransaction.transactionData!.deposit,
        ],
        promptData.selectedVault.chainId as SupportedChainId,
      )
    : await selectedWallet?.send(lendTransaction.transactionData!.deposit, promptData.selectedVault.chainId as SupportedChainId)
    const innerResult = {
      ...lendTransaction,
      hash: depositHash,
      blockExplorerUrl: getBlockExplorerUrl(promptData.selectedVault.chainId as SupportedChainId),
    }
    const result = {
      transaction: {
        blockExplorerUrl: innerResult.blockExplorerUrl,
        hash: innerResult.hash,
        amount: innerResult.amount.toString(),
        asset: innerResult.asset,
        marketId: innerResult.marketId,
        apy: innerResult.apy,
        timestamp: innerResult.timestamp,
        slippage: innerResult.slippage,
        transactionData: serializeBigInt(innerResult.transactionData),
      },
    }

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
Tx:     ${result.transaction.blockExplorerUrl}/${result.transaction.hash || 'pending'}`,
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
      const balanceText = await displayWalletBalance(selectedWallet, true)

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
      content:
        'Funding selected wallet with 100 USDC...',
      timestamp: new Date(),
    }

    setLines((prev) => [...prev, fundingInfo])

    try {
      const { amount } = await fundWallet(selectedWallet)

      const fundSuccessLine: TerminalLine = {
        id: `fund-success-${Date.now()}`,
        type: 'success',
        content: `Wallet funded with ${amount} USDC successfully! Fetching updated balance...`,
        timestamp: new Date(),
      }
      setLines((prev) => [...prev, fundSuccessLine])

      const balanceText = await displayWalletBalance(selectedWallet, true)
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

    // Check if selected wallet has USDC balance before proceeding
    try {
      const balanceResult = await getWalletBalance(selectedWallet)
      const usdcTokens = balanceResult.balance.filter(
        (token) => token.symbol === 'USDC' || token.symbol === 'USDC_DEMO',
      )
      const usdcBalance = usdcTokens.reduce((acc, token) => acc + parseFloat(`${token.totalBalance}`), 0)

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
        const result = await verbsApi.getMarkets()

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
            (vault, index) =>
              `${index === 0 ? '> ' : '  '}${vault.name} - ${(vault.apy * 100).toFixed(2)}% APY`,
          )
          .join('\n')

        const vaultSelectionLine: TerminalLine = {
          id: `vault-selection-${Date.now()}`,
          type: 'output',
          content: `Select a Lending market:\n\n${marketOptions}\n\n[Enter] to select, [↑/↓] to navigate`,
          timestamp: new Date(),
        }

        setLines((prev) => [...prev.slice(0, -1), vaultSelectionLine])
        setPendingPrompt({
          type: 'lendVault',
          message: '',
          data: result.markets,
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle special keys for lend prompts
    if (pendingPrompt && pendingPrompt.type === 'lendVault') {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleLendVaultSelection((pendingPrompt.data as VaultData[]) || [])
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedVaultIndex((prevIndex) =>
          prevIndex > 0
            ? prevIndex - 1
            : (pendingPrompt.data as VaultData[]).length - 1,
        )
        return
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedVaultIndex((prevIndex) =>
          prevIndex < (pendingPrompt.data as VaultData[]).length - 1
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

  // Update the vault selection display to reflect the current selection
  useEffect(() => {
    if (pendingPrompt?.type === 'lendVault') {
      const vaults = pendingPrompt.data as VaultData[]
      const marketOptions = vaults
        .map(
          (vault, index) =>
            `${index === selectedVaultIndex ? '> ' : '  '}${vault.name} - ${(vault.apy * 100).toFixed(2)}% APY`,
        )
        .join('\n')

      const vaultSelectionLine: TerminalLine = {
        id: `vault-selection-${Date.now()}`,
        type: 'output',
        content: `Select a Lending market:\n\n${marketOptions}\n\n[Enter] to select, [↑/↓] to navigate`,
        timestamp: new Date(),
      }

      setLines((prev) => [...prev.slice(0, -1), vaultSelectionLine])
    }
  }, [selectedVaultIndex, pendingPrompt])

  return (
    <div
      className="w-full h-full flex flex-col bg-terminal-bg shadow-terminal-inner cursor-text"
      onClick={handleClick}
    >
      <NavBar fullWidth rightElement={<DynamicWidget />} />

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


function getBlockExplorerUrl(chainId: SupportedChainId) {
  const chain = chainById[chainId]
  if (!chain) {
    throw new Error(`Chain not found for chainId: ${chainId}`)
  }
  if (chain.id === unichain.id) {
    return 'https://unichain.blockscout.com/op'
  }
  if (chain.id === baseSepolia.id) {
    return `https://base-sepolia.blockscout.com/op`
  }
  return chain.blockExplorers ? `${chain.blockExplorers?.default.url}/tx` : ''
}

function serializeBigInt<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  )
}

async function fundWallet(wallet: SmartWallet): Promise<{
  success: boolean
  to: string
  amount: string
}> {
  const walletAddress = wallet.address

  const amountInDecimals = BigInt(Math.floor(parseFloat('100') * 1000000))

  const usdcDemo = SUPPORTED_TOKENS.find((token) => token.metadata.symbol === 'USDC_DEMO')
  if (!usdcDemo) {
    throw new Error('USDC_DEMO not found')
  }

  const calls = [
    {
      to: usdcDemo.address[baseSepolia.id]!,
      data: encodeFunctionData({
        abi: mintableErc20Abi,
        functionName: 'mint',
        args: [walletAddress, amountInDecimals],
      }),
      value: 0n,
    },
  ]

  await wallet.sendBatch(calls, baseSepolia.id)

  return {
    success: true,
    to: walletAddress,
    amount: formatUnits(amountInDecimals, 6),
  }
}

async function getWalletBalance(wallet: SmartWallet): Promise<{ balance: TokenBalance[] }> {
  // Get regular token balances
  const tokenBalances = await wallet.getBalance().catch((error) => {
    console.error(error)
    throw error
  })

  // Get market balances and add them to the response
  const verbs = getVerbs()
  let result: TokenBalance[] = []
  try {
    const vaults = await verbs.lend.getMarkets()

    const vaultBalances = await Promise.all(
      vaults.map(async (vault) => {
        try {
          const walletAddress = wallet.address
          const vaultBalance = await verbs.lend.getMarketBalance(
            { address: vault.address, chainId: vault.chainId as SupportedChainId },
            walletAddress,
          )

          // Only include vaults with non-zero balances
          if (vaultBalance.balance > 0n) {
            // Create a TokenBalance object for the vault
            const formattedBalance = formatUnits(vaultBalance.balance, 6) // Assuming 6 decimals for vault shares
            return {
              symbol: `${vault.name}`,
              totalBalance: vaultBalance.balance,
              totalFormattedBalance: formattedBalance,
              chainBalances: [
                {
                  chainId: vaultBalance.chainId,
                  balance: vaultBalance.balance,
                  tokenAddress: vault.asset,
                  formattedBalance: formattedBalance,
                },
              ],
            } as TokenBalance
          }
          return null
        } catch (error) {
          console.error(error)
          return null
        }
      }),
    )

    // Filter out null values and add vault balances to token balances
    const validVaultBalances = vaultBalances.filter(
      (balance): balance is NonNullable<typeof balance> => balance !== null,
    )

    result = [...tokenBalances, ...validVaultBalances]
  } catch {
    // Return just token balances if vault balance fetching fails
    result = tokenBalances
  }

  return { balance: serializeBigInt(result) }
}