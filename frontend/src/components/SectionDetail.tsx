import React from 'react'
import { Section } from '../types'

interface SectionDetailProps {
  section: Section | null
  onClose: () => void
}

export default function SectionDetail({ section, onClose }: SectionDetailProps) {
  if (!section) return null

  return (
    <div
      className="border-t flex flex-col"
      style={{ borderColor: '#112236', background: '#07111C', maxHeight: '220px' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: '#112236' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-xs font-bold shrink-0"
            style={{ color: '#D97706', fontFamily: 'SF Mono, Fira Code, monospace' }}
          >
            §{section.number}
          </span>
          <span className="text-xs text-slate-400 truncate">{section.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs" style={{ color: '#334155', fontFamily: 'monospace' }}>
            p.{section.page}
          </span>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-400 transition-colors"
            title="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="overflow-y-auto p-3 flex-1">
        {section.text ? (
          <p
            className="text-xs leading-relaxed whitespace-pre-wrap"
            style={{ color: '#64748b', fontFamily: 'SF Mono, Fira Code, monospace' }}
          >
            {section.text}
          </p>
        ) : (
          <p className="text-xs italic" style={{ color: '#334155' }}>
            No text content — section is a container for subsections.
          </p>
        )}
      </div>
    </div>
  )
}
