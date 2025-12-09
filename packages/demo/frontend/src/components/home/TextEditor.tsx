import { colors } from '@/constants/colors'
import { CopyIcon } from '@/assets/icons'

interface TextEditorProps {
  filename: string
  children: React.ReactNode
  onCopy?: () => void
}

function TextEditor({ filename, children, onCopy }: TextEditorProps) {
  return (
    <div
      className="rounded-lg overflow-hidden shadow-2xl"
      style={{
        backgroundColor: colors.bg.code,
        border: '1px solid rgba(80, 73, 69, 0.3)',
        boxShadow:
          '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
      }}
    >
      {/* Terminal header */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{
          backgroundColor: colors.bg.header,
          borderColor: 'rgba(184, 187, 38, 0.15)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="flex items-center space-x-2">
          <div
            className="w-3 h-3 rounded-full shadow-xs"
            style={{ backgroundColor: colors.macos.red }}
          ></div>
          <div
            className="w-3 h-3 rounded-full shadow-xs"
            style={{ backgroundColor: colors.macos.yellow }}
          ></div>
          <div
            className="w-3 h-3 rounded-full shadow-xs"
            style={{
              backgroundColor: colors.macos.green,
              boxShadow: '0 0 6px rgba(184, 187, 38, 0.4)',
            }}
          ></div>
        </div>
        <div
          className="text-xs font-mono"
          style={{ color: colors.syntax.keyword }}
        >
          {filename}
        </div>
      </div>
      {/* Code content */}
      <div className="relative">
        <div
          className="p-8 text-left"
          style={{ backgroundColor: colors.bg.code }}
        >
          {children}
        </div>
        {/* Copy button */}
        {onCopy && (
          <button
            onClick={onCopy}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Copy code"
          >
            <CopyIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default TextEditor
