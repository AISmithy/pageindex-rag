import React, { useCallback, useRef, useState } from 'react'

interface UploadZoneProps {
  onFile: (file: File) => void
  onSample: () => void
}

const ACCEPTED = ['.pdf', '.txt', '.md']

export default function UploadZone({ onFile, onSample }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSubmit = useCallback(
    (file: File) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!ACCEPTED.includes(ext)) {
        setError(`Unsupported file type: ${ext}. Please upload a PDF, TXT, or Markdown file.`)
        return
      }
      setError(null)
      onFile(file)
    },
    [onFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) validateAndSubmit(file)
    },
    [validateAndSubmit],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) validateAndSubmit(file)
    },
    [validateAndSubmit],
  )

  return (
    <main className="flex flex-col items-center justify-center min-h-[calc(100vh-48px)] px-4">
      {/* Logo mark */}
      <div className="mb-8 text-center">
        <span
          className="text-6xl"
          style={{ color: '#D97706' }}
        >
          ◈
        </span>
        <h1
          className="mt-3 text-2xl font-bold tracking-wide"
          style={{ color: '#e2e8f0', fontFamily: 'SF Mono, Fira Code, monospace' }}
        >
          PageIndex
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Vectorless RAG · LLM-navigated document intelligence
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="w-full max-w-lg rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200 p-12 flex flex-col items-center gap-4"
        style={{
          borderColor: dragOver ? '#D97706' : '#1e3a5f',
          background: dragOver ? 'rgba(217, 119, 6, 0.04)' : '#0C1E38',
        }}
      >
        <svg
          className="w-12 h-12"
          style={{ color: dragOver ? '#D97706' : '#334155' }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        <div className="text-center">
          <p className="text-slate-300 font-medium">Drop your document here</p>
          <p className="text-slate-500 text-sm mt-1">or click to browse</p>
        </div>

        <button
          onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
          className="px-5 py-2 rounded text-sm font-medium transition-colors"
          style={{
            background: '#D97706',
            color: '#07111C',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#b45309')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = '#D97706')}
        >
          Choose File
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {/* Supported formats */}
      <p className="mt-3 text-xs text-slate-600">
        Supported formats: PDF · TXT · Markdown
      </p>

      {/* Error */}
      {error && (
        <div
          className="mt-4 px-4 py-2 rounded text-sm max-w-lg w-full"
          style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error}
        </div>
      )}

      {/* Sample document */}
      <div className="mt-6 flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <div className="h-px w-16 bg-slate-700" />
          <span className="text-xs text-slate-600">or try a demo</span>
          <div className="h-px w-16 bg-slate-700" />
        </div>
        <button
          onClick={onSample}
          className="text-sm transition-colors"
          style={{ color: '#D97706' }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#fbbf24')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#D97706')}
        >
          Load sample KYC document
        </button>
      </div>
    </main>
  )
}
