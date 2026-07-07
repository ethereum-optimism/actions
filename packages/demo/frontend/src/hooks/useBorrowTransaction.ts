/**
 * Owns the Borrow form's transaction lifecycle: the execute/reentry guard, the
 * TransactionModal status, and the success toast. `runTransaction` dispatches
 * the open/repay call, logs activity, and surfaces errors.
 */

import { useRef, useState } from 'react'
import { ActionsError } from '@eth-optimism/actions-sdk'
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

  // Reentry guard so a double-tap of Confirm can't dispatch the same transaction twice.
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
      // Provider display name (e.g. "Morpho") so the activity summary reads "Borrowed X OP from Morpho".
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
        // Fresh open pledges the lend position; top-up (or Aave, which supplies collateral at lend time) skips pledging.
        const isTopUp = currentCollUsd > 0
        const freshOpenCollateralRaw = selectedLendPosition.depositedSharesRaw
        if (
          !isTopUp &&
          (freshOpenCollateralRaw === null || freshOpenCollateralRaw <= 0n)
        ) {
          throw new Error(
            'No collateral shares available for this lend position',
          )
        }
        receipt = await handleTransaction('open', {
          marketId: activeMarket.marketId,
          borrowAmount: { amount: amountNum },
          ...(!isTopUp &&
          freshOpenCollateralRaw !== null &&
          freshOpenCollateralRaw > 0n
            ? { collateralAmount: { amountRaw: freshOpenCollateralRaw } }
            : {}),
          collateralAsset: undefined,
        })
      } else if (mode === 'repay') {
        receipt = await handleTransaction('repay', {
          marketId: activeMarket.marketId,
          amount: { amount: amountNum },
        })
      } else {
        throw new Error(`Unsupported transaction mode: ${mode}`)
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
      // Log the full error (revert reason, calldata) for diagnosis; the modal only gets the short reason below.
      console.error(`[borrow] ${mode} failed:`, e)
      // Surface only the SDK's short, human-readable reason; a raw Error here carries the full revert calldata, which must not reach the modal.
      const msg =
        e instanceof ActionsError && e.shortMessage
          ? e.shortMessage
          : 'Transaction failed. Please try again.'
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
