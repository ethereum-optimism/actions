/**
 * Owns the Borrow form's transaction lifecycle: the execute/reentry guard,
 * the TransactionModal status, and the success toast. `runTransaction`
 * dispatches the open/repay call, logs activity, and surfaces errors.
 */

import { useRef, useState } from 'react'
import type { Asset, BorrowMarket } from '@eth-optimism/actions-sdk'
import { getBlockExplorerUrl } from '@/utils/blockExplorer'
import { displaySymbol } from '@/utils/tokenDisplay'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'
import type { MarketPosition } from '@/types/market'

function marketProviderDisplayName(kind: string): string {
  if (kind === 'morpho-blue') return 'Morpho'
  // Fallback: capitalize the provider prefix (e.g. `aave-v3` -> `Aave`).
  const head = kind.split('-')[0] ?? kind
  return head.charAt(0).toUpperCase() + head.slice(1)
}

interface RunTransactionArgs {
  mode: 'borrow' | 'repay'
  activeMarket: BorrowMarket
  activeAsset: Asset
  amountNum: number
  selectedLendPosition: MarketPosition
  currentCollUsd: number
  handleTransaction: UseBorrowProviderReturn['handleTransaction']
  onReviewClose: () => void
  onSuccess: () => void
}

export function useBorrowTransaction() {
  const { logActivity } = useActivityLogger()
  const [isExecuting, setIsExecuting] = useState(false)
  const [txModalOpen, setTxModalOpen] = useState(false)
  const [txStatus, setTxStatus] = useState<'loading' | 'error'>('loading')
  const [txError, setTxError] = useState<string | undefined>()
  const [toast, setToast] = useState<{
    visible: boolean
    title: string
    description: string
  }>({ visible: false, title: '', description: '' })

  // useRef-based reentry guard so a rapid double-tap of the Confirm button
  // can't dispatch the same transaction twice before isExecuting commits.
  const executingRef = useRef(false)

  const runTransaction = async ({
    mode,
    activeMarket,
    activeAsset,
    amountNum,
    selectedLendPosition,
    currentCollUsd,
    handleTransaction,
    onReviewClose,
    onSuccess,
  }: RunTransactionArgs) => {
    if (executingRef.current) return
    executingRef.current = true
    const symbol = displaySymbol(activeAsset.metadata.symbol)
    const activity = logActivity(mode, {
      amount: amountNum.toString(),
      assetSymbol: symbol,
      // Provider display name (e.g. "Morpho"), derived from the market's
      // discriminator, so the activity summary reads "Borrowed X OP from
      // Morpho" instead of "Wallet: borrow".
      marketName: marketProviderDisplayName(activeMarket.marketId.kind),
    })
    setIsExecuting(true)
    onReviewClose()
    setTxModalOpen(true)
    setTxStatus('loading')
    setTxError(undefined)
    try {
      let receipt
      if (mode === 'borrow') {
        const collateralSharesRaw = selectedLendPosition.depositedSharesRaw
        const topUpCollateralSharesRaw =
          currentCollUsd > 0
            ? selectedLendPosition.directDepositedSharesRaw
            : collateralSharesRaw
        if (
          currentCollUsd === 0 &&
          (collateralSharesRaw === null || collateralSharesRaw <= 0n)
        ) {
          throw new Error(
            'No collateral shares available for this lend position',
          )
        }
        receipt = await handleTransaction('open', {
          marketId: activeMarket.marketId,
          borrowAmount: { amount: amountNum },
          ...(topUpCollateralSharesRaw !== null && topUpCollateralSharesRaw > 0n
            ? { collateralAmount: { amountRaw: topUpCollateralSharesRaw } }
            : {}),
          collateralAsset: undefined,
        })
      } else {
        receipt = await handleTransaction('repay', {
          marketId: activeMarket.marketId,
          amount: { amount: amountNum },
        })
      }
      const blockExplorerUrl = getBlockExplorerUrl(
        activeMarket.marketId.chainId,
        receipt,
      )
      activity?.confirm({ blockExplorerUrl })
      setTxModalOpen(false)
      onSuccess()
      setToast({
        visible: true,
        title: mode === 'borrow' ? 'Borrowed' : 'Repaid',
        description: `${amountNum} ${symbol}`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transaction failed'
      activity?.error()
      setTxStatus('error')
      setTxError(msg)
    } finally {
      setIsExecuting(false)
      executingRef.current = false
    }
  }

  return {
    isExecuting,
    runTransaction,
    txModal: {
      isOpen: txModalOpen,
      status: txStatus,
      errorMessage: txError,
      onClose: () => {
        setTxModalOpen(false)
        setTxStatus('loading')
        setTxError(undefined)
      },
    },
    toast: {
      isVisible: toast.visible,
      title: toast.title,
      description: toast.description,
      onClose: () => setToast((t) => ({ ...t, visible: false })),
    },
  }
}
