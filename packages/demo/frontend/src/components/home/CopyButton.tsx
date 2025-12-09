import { CopyIcon } from '@/assets/icons'

interface CopyButtonProps {
  text: string
}

function CopyButton({ text }: CopyButtonProps) {
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text)}
      className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors"
      aria-label="Copy code"
    >
      <CopyIcon className="w-5 h-5" />
    </button>
  )
}

export default CopyButton
