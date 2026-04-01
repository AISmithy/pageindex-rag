import React from 'react'

interface HeaderBarProps {
  documentName: string | null
  onReset: () => void
  showReset: boolean
}

export default function HeaderBar({ documentName, onReset, showReset }: HeaderBarProps) {
  return (
    <header
      className="flex items-center justify-between px-4 h-12 border-b border-navy-border"
      style={{ background: '#07111C', borderColor: '#112236' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-amber-500 text-lg font-bold">◈</span>
        <span
          className="text-sm font-bold tracking-widest uppercase"
          style={{ color: '#D97706', fontFamily: 'SF Mono, Fira Code, monospace', letterSpacing: '0.2em' }}
        >
          PageIndex
        </span>
        <span className="text-xs text-slate-500 ml-1 hidden sm:inline">Vectorless RAG</span>
      </div>

      {/* Document name badge + reset */}
      <div className="flex items-center gap-3">
        {documentName && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border"
            style={{
              background: '#0C1E38',
              borderColor: '#1e3a5f',
              color: '#94a3b8',
              fontFamily: 'SF Mono, Fira Code, monospace',
              maxWidth: '220px',
            }}
          >
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="truncate">{documentName}</span>
          </div>
        )}

        {showReset && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors"
            style={{
              background: 'transparent',
              border: '1px solid #1e3a5f',
              color: '#64748b',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#D97706'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#D97706'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#1e3a5f'
              ;(e.currentTarget as HTMLButtonElement).style.color = '#64748b'
            }}
            title="Upload a new document"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 4v16m8-8H4" />
            </svg>
            New Document
          </button>
        )}
      </div>
    </header>
  )
}
