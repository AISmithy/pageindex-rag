import React from 'react'
import { Citation } from '../types'

interface CitationRowProps {
  citations: Citation[]
  onCitationClick: (id: string) => void
}

export default function CitationRow({ citations, onCitationClick }: CitationRowProps) {
  if (!citations || citations.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {citations.map(citation => (
        <button
          key={citation.id}
          onClick={() => onCitationClick(citation.id)}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all duration-200"
          style={{
            background: 'rgba(134, 239, 172, 0.08)',
            border: '1px solid rgba(134, 239, 172, 0.3)',
            color: '#86EFAC',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'rgba(134, 239, 172, 0.15)'
            el.style.borderColor = 'rgba(134, 239, 172, 0.6)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'rgba(134, 239, 172, 0.08)'
            el.style.borderColor = 'rgba(134, 239, 172, 0.3)'
          }}
          title={citation.title}
        >
          <span style={{ fontFamily: 'SF Mono, Fira Code, monospace', fontSize: '10px' }}>
            §{citation.number}
          </span>
          <span className="max-w-[120px] truncate" style={{ fontSize: '10px' }}>
            {citation.title}
          </span>
        </button>
      ))}
    </div>
  )
}
