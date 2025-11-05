import { Modal, ModalContent, ModalActions, ModalButton } from '../Modal'

interface WalletProviderSwitchModalProps {
  isOpen: boolean
  onClose: () => void
  targetProvider: string
  onConfirm: () => void
}

export function WalletProviderSwitchModal({
  isOpen,
  onClose,
  targetProvider,
  onConfirm,
}: WalletProviderSwitchModalProps) {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const handleCancel = () => {
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} allowBackdropClose={false}>
      <ModalContent
        icon={
          <div className="rounded-full flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EF4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
        }
        title="Switch Wallet Provider"
        description={`Switching to ${targetProvider} will log you out of your current session. Please log in again to continue.`}
      >
        <ModalActions>
          <ModalButton onClick={handleCancel} variant="secondary">
            Cancel
          </ModalButton>
          <ModalButton onClick={handleConfirm} variant="danger">
            Log out & Continue
          </ModalButton>
        </ModalActions>
      </ModalContent>
    </Modal>
  )
}
