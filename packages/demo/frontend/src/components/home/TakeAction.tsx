import { colors } from '@/constants/colors'
import { TerminalIcon, DocumentIcon, GithubIcon } from '@/assets/icons'

interface TakeActionProps {
  showGithub?: boolean
  compact?: boolean
}

function TakeAction({ showGithub = false, compact = false }: TakeActionProps) {
  return (
    <div className={`pt-8 ${compact ? 'pb-8' : 'pb-64'} text-center`}>
      <h3
        className="text-2xl font-medium mb-6"
        style={{ color: colors.text.cream }}
      >
        Ready to take Action?
      </h3>
      <div className="flex flex-row gap-4 justify-center">
        <a
          href="/earn"
          className="text-black px-8 py-3 rounded-lg font-medium inline-flex items-center justify-center gap-2 transition-colors duration-200"
          style={{ backgroundColor: colors.text.cream }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = '#E5E5CC')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = colors.text.cream)
          }
        >
          <TerminalIcon className="w-5 h-5" />
          Demo
        </a>
        {showGithub ? (
          <a
            href="https://github.com/ethereum-optimism/actions"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-gray-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-700 inline-flex items-center justify-center gap-2 transition-colors duration-200"
            style={{ color: colors.text.cream }}
          >
            <GithubIcon className="w-5 h-5" />
            Github
          </a>
        ) : (
          <a
            href="/docs"
            className="border border-gray-600 px-8 py-3 rounded-lg font-medium hover:bg-gray-700 inline-flex items-center justify-center gap-2 transition-colors duration-200"
            style={{ color: colors.text.cream }}
          >
            <DocumentIcon className="w-5 h-5" />
            Docs
          </a>
        )}
      </div>
    </div>
  )
}

export default TakeAction
