import { useState } from 'react'
import { CopyIcon } from '@/assets/icons'

interface WalletAddressDisplayProps {
  address: string
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 24)}……${address.slice(-4)}`
}

export function WalletAddressDisplay({ address }: WalletAddressDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="flex items-center justify-between px-4 py-3 rounded-lg"
      style={{
        backgroundColor: '#F3F4F6',
      }}
    >
      <span className="text-sm font-mono" style={{ color: '#1a1b1e' }}>
        {truncateAddress(address)}
      </span>
      <button
        className="p-1 hover:bg-gray-200 rounded-sm transition-colors"
        onClick={handleCopy}
        aria-label={copied ? 'Copied!' : 'Copy address'}
        style={{ color: '#1a1b1e' }}
      >
        {copied ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ) : (
          <CopyIcon className="w-5 h-5" />
        )}
      </button>
    </div>
  )
}
