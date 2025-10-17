import { useState } from 'react'

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
        className="p-1 hover:bg-gray-200 rounded transition-colors"
        onClick={handleCopy}
        aria-label={copied ? 'Copied!' : 'Copy address'}
      >
        {copied ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1a1b1e"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1a1b1e"
            strokeWidth="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        )}
      </button>
    </div>
  )
}
