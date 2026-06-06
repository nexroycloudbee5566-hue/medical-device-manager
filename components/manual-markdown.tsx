'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

function headingId(text: string): string {
  const t = text.trim()
  const numbered = t.match(/^(\d+)\.\s*(.+)$/)
  if (numbered) {
    return `${numbered[1]}-${numbered[2].replace(/\s+/g, '')}`
  }
  return t.replace(/\s+/g, '')
}

function flattenText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(flattenText).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    const el = children as { props?: { children?: React.ReactNode } }
    return flattenText(el.props?.children ?? '')
  }
  return ''
}

const components: Components = {
  h2: ({ children }) => {
    const id = headingId(flattenText(children))
    return (
      <h2 id={id} className="manual-h2">
        {children}
      </h2>
    )
  },
  h3: ({ children }) => <h3 className="manual-h3">{children}</h3>,
  a: ({ href, children }) => (
    <a href={href} className="manual-link">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="manual-table-wrap">
      <table className="manual-table">{children}</table>
    </div>
  ),
  blockquote: ({ children }) => <blockquote className="manual-blockquote">{children}</blockquote>,
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return <code className="manual-code-block">{children}</code>
    }
    return <code className="manual-code-inline">{children}</code>
  },
  pre: ({ children }) => <pre className="manual-pre">{children}</pre>,
}

export function ManualMarkdown({ content }: { content: string }) {
  return (
    <article className="manual-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  )
}
