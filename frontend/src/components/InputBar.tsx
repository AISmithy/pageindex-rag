import React, { useRef, useState } from 'react'

interface InputBarProps {
  onSubmit: (question: string) => void
  disabled: boolean
}

export default function InputBar({ onSubmit, disabled }: InputBarProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-resize
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
  }

  return (
    <div
      className="px-4 py-3 border-t"
      style={{ borderColor: '#112236', background: '#07111C' }}
    >
      <div
        className="flex items-end gap-3 rounded-lg px-3 py-2"
        style={{ background: '#0C1E38', border: '1px solid #1e3a5f' }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Navigating document tree...' : 'Ask a question about the document...'}
          rows={1}
          className="flex-1 bg-transparent text-sm resize-none focus:outline-none"
          style={{
            color: '#e2e8f0',
            caretColor: '#D97706',
            maxHeight: '120px',
            lineHeight: '1.5',
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="shrink-0 w-8 h-8 rounded flex items-center justify-center transition-all duration-200 mb-0.5"
          style={{
            background:
              disabled || !value.trim() ? '#112236' : '#D97706',
            cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
          }}
          title="Send (Enter)"
        >
          <svg
            className="w-4 h-4"
            style={{ color: disabled || !value.trim() ? '#334155' : '#07111C' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
      <p className="text-xs mt-1.5 text-center" style={{ color: '#1e3a5f' }}>
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  )
}
