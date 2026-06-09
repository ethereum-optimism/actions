/**
 * The Borrow form's overlays: asset picker, review/confirm modal,
 * transaction-status modal, and success toast. Split out of BorrowAction so the
 * form stays focused on state + derivation.
 */

import { createPortal } from 'react-dom'
import type { Asset, BorrowMarket } from '@eth-optimism/actions-sdk'
import TransactionModal from '../TransactionModal'
import { Toast } from '../Toast'
import { BorrowAssetModal } from './BorrowAssetModal'
import { ReviewBorrowHealthModal } from './ReviewBorrowHealthModal'

export interface BorrowHealthProps {
  currentLtv: number
  projectedLtv: number
  maxLtv: number
  bufferPct: number
  borrowApy: number
  collateralAsset: Asset
  collateralValueUsd: number
  projectedHealthFactor: number
  wouldLiquidate: boolean
}

export function BorrowActionModals({
  assetModalOpen,
  onAssetModalClose,
  eligibleMarkets,
  onAssetSelect,
  reviewOpen,
  onReviewClose,
  onReviewConfirm,
  isExecuting,
  mode,
  amount,
  amountUsd,
  activeAsset,
  health,
  txModal,
  toast,
}: {
  assetModalOpen: boolean
  onAssetModalClose: () => void
  eligibleMarkets: readonly BorrowMarket[]
  onAssetSelect: (market: BorrowMarket) => void
  reviewOpen: boolean
  onReviewClose: () => void
  onReviewConfirm: () => void
  isExecuting: boolean
  mode: 'borrow' | 'repay'
  amount: string
  amountUsd: number
  activeAsset: Asset | null
  health: BorrowHealthProps | null
  txModal: {
    isOpen: boolean
    status: 'loading' | 'error'
    errorMessage?: string
    onClose: () => void
  }
  toast: {
    isVisible: boolean
    title: string
    description: string
    onClose: () => void
  }
}) {
  return (
    <>
      <BorrowAssetModal
        isOpen={assetModalOpen}
        onClose={onAssetModalClose}
        markets={eligibleMarkets}
        onSelect={onAssetSelect}
      />

      {health && activeAsset && (
        <ReviewBorrowHealthModal
          isOpen={reviewOpen}
          onClose={onReviewClose}
          onConfirm={onReviewConfirm}
          isExecuting={isExecuting}
          flow={mode}
          amount={{ main: amount || '0' }}
          amountUsd={amountUsd > 0 ? `$${amountUsd.toFixed(2)}` : null}
          asset={activeAsset}
          {...health}
        />
      )}

      <TransactionModal
        isOpen={txModal.isOpen}
        status={txModal.status}
        errorMessage={txModal.errorMessage}
        onClose={txModal.onClose}
      />

      {createPortal(
        <Toast
          isVisible={toast.isVisible}
          onClose={toast.onClose}
          title={toast.title}
          description={toast.description}
        />,
        document.body,
      )}
    </>
  )
}
