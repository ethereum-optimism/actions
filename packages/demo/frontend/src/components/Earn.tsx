import { useState, useEffect, useRef } from 'react'
import Info from './Info'
import ActivityLog from './ActivityLog'

function Earn() {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFFFF', fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
      {/* Custom Header */}
      <header className="w-full" style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E0E2EB' }}>
        <div className="w-full px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src="/Optimism.svg"
                alt="Optimism"
                className="h-4"
              />
            </div>
            <div className="flex items-center gap-8">
              {/* Dropdown Menu */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:bg-gray-50"
                  style={{
                    border: '1px solid #E5E5E5',
                    backgroundColor: dropdownOpen ? '#F5F5F5' : 'transparent'
                  }}
                >
                  <img
                    src="/Privy.png"
                    alt="Privy"
                    className="h-5"
                  />
                  <span className="text-sm" style={{ color: '#1a1b1e' }}>
                    Privy
                  </span>
                  <svg
                    className="w-4 h-4 transition-transform"
                    style={{
                      transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                      color: '#666666'
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

                {dropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg overflow-hidden"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E5E5E5',
                      zIndex: 50
                    }}
                  >
                    hello
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex" style={{ height: 'calc(100vh - 65px)' }}>
        {/* Left Content Area */}
        <div className="flex-1 flex flex-col items-center p-8" style={{ maxWidth: 'calc(100% - 436px)' }}>
          <div className="w-full max-w-2xl">
            {/* Title Section */}
            <div className="mb-8 text-left">
              <div className="flex items-center gap-2 mb-2">
                <h1
                  style={{
                    color: '#1a1b1e',
                    fontSize: '24px',
                    fontStyle: 'normal',
                    fontWeight: 600
                  }}
                >
                  Verbs Earn Demo
                </h1>
                <span
                  className="px-2 py-2 text-xs font-medium rounded"
                  style={{
                    backgroundColor: '#F2F3F8',
                    color: '#404454',
                    fontSize: '14px',
                    fontWeight: 400
                  }}
                >
                  Sandbox
                </span>
              </div>
              <p
                style={{
                  color: '#666666',
                  fontSize: '16px'
                }}
              >
                Earn interest by lending USDC
              </p>
            </div>

            <Info />
          </div>
        </div>

        {/* Activity Log - Right Side */}
        <div style={{ width: '436px' }}>
          <ActivityLog />
        </div>
      </main>
    </div>
  )
}

export default Earn