interface WalletProviderOptionProps {
  name: string
  logoSrc: string
  isSelected: boolean
  onClick?: () => void
}

export function WalletProviderOption({
  name,
  logoSrc,
  isSelected,
  onClick,
}: WalletProviderOptionProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${isSelected ? 'bg-[#F8FAFC]' : 'bg-white hover:bg-gray-50'}`}
      style={{
        border: isSelected ? '2px solid #3B82F6' : '1px solid #E5E7EB',
      }}
    >
      <div className="flex items-center gap-3">
        <img src={logoSrc} alt={name} className="w-5 h-5" />
        <span className="text-base font-medium" style={{ color: '#1a1b1e' }}>
          {name}
        </span>
      </div>
      {isSelected && (
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="3"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      )}
    </button>
  )
}
