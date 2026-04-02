import React, { useEffect, useMemo, useRef } from 'react'
import { DocumentTree, Message } from '../types'
import MessageBubble from './MessageBubble'
import InputBar from './InputBar'

interface ChatPanelProps {
  messages: Message[]
  thinking: boolean
  tree: DocumentTree | null
  onQuestion: (question: string) => void
  onCitationClick: (id: string) => void
}

function buildStarterQuestions(tree: DocumentTree | null): string[] {
  if (!tree || !tree.sections.length) return []

  const titles: string[] = []
  for (const s of tree.sections) {
    titles.push(s.title)
    for (const c of s.children) {
      titles.push(c.title)
    }
  }

  // Pick up to 4 well-spaced sections to generate questions from
  const step = Math.max(1, Math.floor(titles.length / 4))
  const picked: string[] = []
  for (let i = 0; i < titles.length && picked.length < 4; i += step) {
    picked.push(titles[i])
  }

  return picked.map(t => `What does the document say about ${t}?`)
}

export default function ChatPanel({
  messages,
  thinking,
  tree,
  onQuestion,
  onCitationClick,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const starterQuestions = useMemo(() => buildStarterQuestions(tree), [tree])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  return (
    <main className="flex flex-col flex-1 min-w-0" style={{ background: '#07111C' }}>
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <EmptyState onSuggestion={onQuestion} />
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                onCitationClick={onCitationClick}
              />
            ))}
          </>
        )}

        {/* Thinking indicator */}
        {thinking && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs" style={{ color: '#D97706' }}>◈</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: '#D97706', fontFamily: 'monospace' }}>
                Navigating document tree
              </span>
              <span className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="inline-block w-1 h-1 rounded-full"
                    style={{
                      background: '#D97706',
                      animation: `bounce 1.2s ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </span>
            </div>
            <style>{`
              @keyframes bounce {
                0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                40% { opacity: 1; transform: scale(1); }
              }
            `}</style>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Starter questions — shown only until first message */}
      {messages.length === 0 && (
        <div className="px-6 pb-2">
          <div className="flex flex-wrap gap-2 mb-3">
            {starterQuestions.map(q => (
              <button
                key={q}
                onClick={() => onQuestion(q)}
                disabled={thinking}
                className="px-3 py-1.5 rounded-full text-xs transition-all duration-200"
                style={{
                  background: '#0C1E38',
                  border: '1px solid #1e3a5f',
                  color: '#64748b',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.borderColor = '#D97706'
                  el.style.color = '#D97706'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.borderColor = '#1e3a5f'
                  el.style.color = '#64748b'
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input bar */}
      <InputBar onSubmit={onQuestion} disabled={thinking} />
    </main>
  )
}

function EmptyState({ onSuggestion }: { onSuggestion: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <span className="text-4xl mb-4" style={{ color: '#1e3a5f' }}>◈</span>
      <h3 className="text-base font-semibold mb-2" style={{ color: '#334155' }}>
        Document indexed
      </h3>
      <p className="text-sm max-w-sm" style={{ color: '#1e3a5f' }}>
        Ask any question about the document. The LLM will navigate the tree and retrieve
        the exact sections relevant to your query.
      </p>
    </div>
  )
}
