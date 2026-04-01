import React from 'react'
import { Message } from '../types'
import CitationRow from './CitationRow'

interface MessageBubbleProps {
  message: Message
  onCitationClick: (id: string) => void
}

export default function MessageBubble({ message, onCitationClick }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div
          className="max-w-[75%] px-4 py-3 rounded-lg text-sm"
          style={{
            background: '#0C1E38',
            border: '1px solid #1e3a5f',
            color: '#cbd5e1',
            lineHeight: '1.6',
          }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  // Assistant message
  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[85%]">
        {/* Label */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs" style={{ color: '#D97706' }}>◈</span>
          <span
            className="text-xs font-semibold"
            style={{ color: '#D97706', fontFamily: 'SF Mono, Fira Code, monospace' }}
          >
            PageIndex
          </span>
        </div>

        {/* Content bubble */}
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: '#090F1E',
            border: '1px solid #112236',
            color: '#cbd5e1',
            lineHeight: '1.7',
            whiteSpace: 'pre-wrap',
          }}
        >
          {message.content || (
            <span style={{ color: '#334155' }}>Generating answer...</span>
          )}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-2 px-1">
            <p className="text-xs mb-1" style={{ color: '#334155' }}>Sources:</p>
            <CitationRow
              citations={message.citations}
              onCitationClick={onCitationClick}
            />
          </div>
        )}
      </div>
    </div>
  )
}
