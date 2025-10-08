import { colors } from '@/constants/colors'
import Code from './Code'
import CopyButton from './CopyButton'
import TerminalHeader from './TerminalHeader'

interface CodeBlockProps {
  code: string
  filename: string
  language?: string
}

function CodeBlock({ code, filename, language = 'typescript' }: CodeBlockProps) {
  return (
    <div
      className="rounded-lg overflow-hidden mb-8 shadow-2xl"
      style={{
        backgroundColor: colors.bg.code,
        border: '1px solid rgba(80, 73, 69, 0.3)',
        boxShadow:
          '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(184, 187, 38, 0.05)',
      }}
    >
      <TerminalHeader filename={filename} />
      <div
        className="p-8 text-left relative"
        style={{ backgroundColor: colors.bg.code }}
      >
        <Code code={code} language={language} />
        <CopyButton text={code} />
      </div>
    </div>
  )
}

export default CodeBlock
