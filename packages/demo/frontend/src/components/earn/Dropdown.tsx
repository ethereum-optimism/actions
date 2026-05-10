import { useEffect, useRef, useState } from 'react'

interface DropdownProps<T> {
  options: T[]
  selected: T | null
  onSelect: (option: T) => void
  keyOf: (option: T) => string
  isSelected: (option: T, selected: T | null) => boolean
  renderOption: (option: T) => React.ReactNode
  placeholder?: string
  isLoading?: boolean
  loadingContent?: React.ReactNode
}

export function Dropdown<T>({
  options,
  selected,
  onSelect,
  keyOf,
  isSelected,
  renderOption,
  placeholder = 'Select an option',
  isLoading = false,
  loadingContent,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
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

  const handleClick = (option: T) => {
    onSelect(option)
    setIsOpen(false)
  }

  if (isLoading) {
    return loadingContent ?? null
  }

  if (options.length === 0) {
    return null
  }

  return (
    <div
      className="w-full relative"
      style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      ref={dropdownRef}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-3 transition-all hover:bg-gray-50"
        style={{
          border: '1px solid #E0E2EB',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
        }}
      >
        {selected ? (
          renderOption(selected)
        ) : (
          <span className="text-sm" style={{ color: '#666666' }}>
            {placeholder}
          </span>
        )}
        <svg
          className="w-4 h-4 transition-transform ml-2"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            color: '#666666',
            flexShrink: 0,
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
          className="absolute left-0 right-0 mt-1 shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E0E2EB',
            borderRadius: '12px',
            zIndex: 50,
          }}
        >
          <div className="py-2">
            {options
              .filter((o) => !isSelected(o, selected))
              .map((option, index) => (
                <button
                  key={keyOf(option)}
                  onClick={() => handleClick(option)}
                  className="w-full px-4 py-3 flex items-center transition-all hover:bg-gray-50"
                  style={{
                    borderTop: index > 0 ? '1px solid #E0E2EB' : 'none',
                  }}
                >
                  {renderOption(option)}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
