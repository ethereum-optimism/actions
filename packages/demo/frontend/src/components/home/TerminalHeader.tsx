import { colors } from '@/constants/colors'

interface TerminalHeaderProps {
  filename: string
}

function TerminalHeader({ filename }: TerminalHeaderProps) {
  return (
    <div
      className="px-4 py-3 border-b flex items-center justify-between"
      style={{
        backgroundColor: 'rgba(40, 40, 40, 0.99)',
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
            backgroundColor: 'rgb(184, 187, 38)',
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
  )
}

export default TerminalHeader
