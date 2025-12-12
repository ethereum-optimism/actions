import { CopyIcon } from '@/assets/icons'
import { trackEvent } from '@/utils/analytics'

interface CopyButtonProps {
  text: string
  snippetName?: string
}

function CopyButton({ text, snippetName }: CopyButtonProps) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        trackEvent('code_copy', { snippet: snippetName || 'code_block' })
      }}
      className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors"
      aria-label="Copy code"
    >
      <CopyIcon className="w-5 h-5" />
    </button>
  )
}

export default CopyButton
