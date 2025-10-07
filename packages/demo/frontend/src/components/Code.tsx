import { useEffect, useRef } from 'react'
import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import 'highlight.js/styles/base16/gruvbox-dark-medium.css'
import { colors } from '@/constants/colors'

hljs.registerLanguage('typescript', typescript)

interface CodeProps {
  code: string
  language?: string
  showLineNumbers?: boolean
}

function Code({ code, language = 'typescript' }: CodeProps) {
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current)

      // Post-process the HTML
      let html = codeRef.current.innerHTML

      // Wrap variable names after 'const' in a custom class
      html = html.replace(
        /(<span class="hljs-keyword">const<\/span> )(\w+)/g,
        '$1<span class="var-name">$2</span>'
      )

      // Wrap destructuring braces after const in purple
      html = html.replace(
        /(<span class="hljs-keyword">const<\/span> )(\{)/g,
        '$1<span class="func-brace">$2</span>'
      )
      html = html.replace(
        /(\})( = )/g,
        '<span class="func-brace">$1</span>$2'
      )

      // Wrap import braces in yellow class
      html = html.replace(
        /(<span class="hljs-keyword">import<\/span> )([{])/g,
        '$1<span class="import-brace">$2</span>'
      )
      html = html.replace(
        /([}])(.*?<span class="hljs-keyword">from<\/span>)/g,
        '<span class="import-brace">$1</span>$2'
      )

      // Wrap all parentheses in yellow
      html = html.replace(
        /(\()/g,
        '<span class="import-brace">$1</span>'
      )
      html = html.replace(
        /(\))/g,
        '<span class="import-brace">$1</span>'
      )
      // Opening brace in purple
      html = html.replace(
        /(<span class="import-brace">\(<\/span>)(\{)/g,
        '$1<span class="func-brace">$2</span>'
      )
      // Closing brace and paren in purple and yellow
      html = html.replace(
        /(\})(<span class="import-brace">\)<\/span>)/g,
        '<span class="func-brace">$1</span>$2'
      )

      // Separate string quotes from content
      html = html.replace(
        /<span class="hljs-string">('|")([^'"]*?)('|")<\/span>/g,
        '<span class="string-quote">$1</span><span class="hljs-string">$2</span><span class="string-quote">$3</span>'
      )

      codeRef.current.innerHTML = html
    }
  }, [code])

  return (
    <>
      <style>{`
        .hljs-keyword { color: ${colors.syntax.keyword} !important; }
        .hljs-variable.constant_ { color: ${colors.syntax.string} !important; }
        code.hljs { color: ${colors.blue} !important; }
        .hljs-attr { color: ${colors.text.primary} !important; }
        .hljs-title.function_ { color: ${colors.syntax.variable} !important; }
        .var-name { color: ${colors.syntax.string} !important; }
        .hljs-string { color: ${colors.syntax.variable} !important; }
        .string-quote { color: ${colors.text.primary} !important; }
        .import-brace { color: ${colors.syntax.string} !important; }
        .func-brace { color: ${colors.syntax.number} !important; }
      `}</style>
      <pre
        style={{
          background: colors.bg.code,
          margin: 0,
          padding: 0,
          fontVariantLigatures: 'none',
          fontFeatureSettings: '"liga" 0',
        }}
      >
        <code ref={codeRef} className={`language-${language}`}>
          {code}
        </code>
      </pre>
    </>
  )
}

export default Code
