import { useState, useEffect, useRef } from 'react'
import { WalletProviderOption } from './WalletProviderOption'
import { WalletAddressDisplay } from './WalletAddressDisplay'
import { WalletProviderSwitchModal } from './WalletProviderSwitchModal'
import {
  WALLET_PROVIDER_CONFIGS,
  type WalletProviderConfig,
} from '@/constants/walletProviders'

interface WalletProviderDropdownProps {
  walletAddress: string | null
  onProviderSelect?: (providerName: WalletProviderConfig) => void
  selectedProvider: WalletProviderConfig
  onLogout?: () => Promise<void>
}

const WALLET_PROVIDERS_LIST = Object.values(WALLET_PROVIDER_CONFIGS)

export function WalletProviderDropdown({
  walletAddress,
  onProviderSelect,
  selectedProvider,
  onLogout,
}: WalletProviderDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showSwitchModal, setShowSwitchModal] = useState(false)
  const [pendingProvider, setPendingProvider] =
    useState<WalletProviderConfig | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleProviderClick = (walletProvider: WalletProviderConfig) => {
    if (walletProvider.name === selectedProvider.name) {
      setIsOpen(false)
      return
    }

    setPendingProvider(walletProvider)
    setShowSwitchModal(true)
    setIsOpen(false)
  }

  const handleConfirmSwitch = () => {
    if (pendingProvider) {
      onProviderSelect?.(pendingProvider)
      setPendingProvider(null)
    }
  }

  const handleCancelSwitch = () => {
    setPendingProvider(null)
    setShowSwitchModal(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:bg-gray-50"
        style={{
          border: '1px solid #E5E5E5',
          backgroundColor: isOpen ? '#F5F5F5' : 'transparent',
        }}
      >
        <img
          src={selectedProvider.logoSrc}
          alt={selectedProvider.name}
          className="h-5"
        />
        <span className="text-sm" style={{ color: '#1a1b1e' }}>
          {selectedProvider.name}
        </span>
        <svg
          className="w-4 h-4 transition-transform"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            color: '#666666',
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E5E5E5',
            zIndex: 50,
            width: '400px',
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3
                className="text-xl font-semibold"
                style={{ color: '#1a1b1e' }}
              >
                Wallet Provider
              </h3>
              <span className="text-sm" style={{ color: '#666666' }}>
                Demo only
              </span>
            </div>

            <div className="space-y-3 mb-6">
              {WALLET_PROVIDERS_LIST.map((provider) => (
                <WalletProviderOption
                  key={provider.name}
                  name={provider.name}
                  logoSrc={provider.logoSrc}
                  isSelected={selectedProvider.name === provider.name}
                  onClick={() => handleProviderClick(provider)}
                />
              ))}
            </div>

            {walletAddress && <WalletAddressDisplay address={walletAddress} />}

            {onLogout && (
              <button
                onClick={async () => {
                  setIsOpen(false)
                  await onLogout()
                }}
                className="w-full mt-4 py-2 rounded-lg transition-all"
                style={{
                  backgroundColor: '#F2F3F8',
                  color: '#404454',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#E0E2EB'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F2F3F8'
                }}
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}

      <WalletProviderSwitchModal
        isOpen={showSwitchModal}
        onClose={handleCancelSwitch}
        targetProvider={pendingProvider?.name || ''}
        onConfirm={handleConfirmSwitch}
      />
    </div>
  )
}
