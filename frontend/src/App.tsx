import React, { useCallback, useRef, useState } from 'react'
import { Citation, DocumentTree, Message, UploadState } from './types'
import HeaderBar from './components/HeaderBar'
import UploadZone from './components/UploadZone'
import ProgressOverlay from './components/ProgressOverlay'
import DocumentSidebar from './components/DocumentSidebar'
import ChatPanel from './components/ChatPanel'
import { SAMPLE_KYC_TEXT, SAMPLE_FILENAME } from './sample-doc'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

const PROGRESS_STEPS = [
  { label: 'Reading structure...', pct: 20 },
  { label: 'Detecting headings...', pct: 40 },
  { label: 'Building tree...', pct: 60 },
  { label: 'Embedding text...', pct: 80 },
  { label: 'Finalizing...', pct: 95 },
]

async function extractPdfText(file: File): Promise<string> {
  const pdfjsLib = window.pdfjsLib
  if (!pdfjsLib) throw new Error('pdf.js not loaded. Please refresh the page.')

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Use Y-position to detect line breaks between text items.
    // Items sharing the same Y coordinate are on the same line;
    // a change in Y means a new line. This preserves heading structure
    // so the tree builder's heading-detection regex can match.
    const items = content.items as Array<{ str: string; transform: number[] }>
    let lastY: number | null = null
    let pageText = ''
    for (const item of items) {
      if (!item.str) continue
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        pageText += '\n'
      }
      pageText += item.str
      lastY = y
    }
    pageTexts.push(pageText)
  }

  return pageTexts.join('\n')
}

async function extractText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(file)
  }
  return file.text()
}

export default function App() {
  const [doc, setDoc] = useState<DocumentTree | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [thinking, setThinking] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set())
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [ingestError, setIngestError] = useState<string | null>(null)
  // Guard against double-clicks / duplicate submissions
  const ingesting = useRef(false)

  // ── Progress simulation ────────────────────────────────────────────────────
  const runProgressSteps = useCallback(async () => {
    for (const step of PROGRESS_STEPS) {
      setProgressLabel(step.label)
      setProgress(step.pct)
      await new Promise(r => setTimeout(r, 600))
    }
  }, [])

  // ── Ingest pipeline ────────────────────────────────────────────────────────
  const ingestDocument = useCallback(
    async (filename: string, text: string) => {
      if (ingesting.current) return
      ingesting.current = true
      setUploadState('processing')
      setIngestError(null)

      // Run progress animation concurrently with the API call
      const progressPromise = runProgressSteps()

      let data: { document_id: string; tree: DocumentTree }
      try {
        const res = await fetch(`${BACKEND_URL}/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, text }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: 'Ingestion failed.' }))
          throw new Error(err.detail || 'Ingestion failed.')
        }
        data = await res.json()
      } catch (err: unknown) {
        await progressPromise
        const message = err instanceof Error ? err.message : 'Unknown error during ingestion.'
        setIngestError(message)
        setUploadState('idle')
        ingesting.current = false
        return
      }

      // Wait for progress animation to finish so UX feels deliberate
      await progressPromise

      // Create session
      let sessionData: { session_id: string }
      try {
        const sessionRes = await fetch(`${BACKEND_URL}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_id: data.document_id }),
        })
        if (!sessionRes.ok) throw new Error('Session creation failed.')
        sessionData = await sessionRes.json()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Session error.'
        setIngestError(message)
        setUploadState('idle')
        ingesting.current = false
        return
      }

      setProgress(100)
      setProgressLabel('Ready')
      setDoc(data.tree)
      setSessionId(sessionData.session_id)
      setUploadState('ready')
      ingesting.current = false
    },
    [runProgressSteps],
  )

  // ── File handling ──────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      let text: string
      try {
        text = await extractText(file)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to extract text from file.'
        setIngestError(message)
        return
      }
      if (!text.trim()) {
        setIngestError('The file appears to be empty or contains no extractable text.')
        return
      }
      await ingestDocument(file.name, text)
    },
    [ingestDocument],
  )

  const handleSampleDocument = useCallback(async () => {
    await ingestDocument(SAMPLE_FILENAME, SAMPLE_KYC_TEXT)
  }, [ingestDocument])

  // ── Chat ───────────────────────────────────────────────────────────────────
  const handleQuestion = useCallback(
    async (question: string) => {
      if (!sessionId || thinking) return

      // Add user message
      setMessages(prev => [...prev, { role: 'user', content: question }])
      setThinking(true)

      // Add placeholder assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: '', citations: [] }])

      try {
        const res = await fetch(`${BACKEND_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, question }),
        })

        if (!res.ok || !res.body) {
          throw new Error('Chat request failed.')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw) continue

            let event: { type: string; [key: string]: unknown }
            try {
              event = JSON.parse(raw)
            } catch {
              continue
            }

            if (event.type === 'citation') {
              const sections = (event.sections_used ?? []) as Citation[]
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  citations: sections,
                }
                return updated
              })
              setHighlighted(new Set(sections.map(c => c.id)))
            } else if (event.type === 'delta') {
              const chunk = (event.content ?? '') as string
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + chunk,
                }
                return updated
              })
            } else if (event.type === 'done') {
              setThinking(false)
            } else if (event.type === 'error') {
              console.error('Pipeline error:', event.message)
              setThinking(false)
            }
          }
        }
      } catch (err) {
        console.error('Chat error:', err)
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: 'An error occurred. Please try again.',
          }
          return updated
        })
      } finally {
        setThinking(false)
      }
    },
    [sessionId, thinking],
  )

  // ── Section interactions ───────────────────────────────────────────────────
  const handleSectionClick = useCallback((id: string) => {
    setActiveSection(prev => (prev === id ? null : id))
  }, [])

  const handleCitationClick = useCallback((id: string) => {
    setActiveSection(id)
    setHighlighted(new Set([id]))
  }, [])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    ingesting.current = false
    setDoc(null)
    setUploadState('idle')
    setProgress(0)
    setProgressLabel('')
    setMessages([])
    setThinking(false)
    setActiveSection(null)
    setHighlighted(new Set())
    setSessionId(null)
    setIngestError(null)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#07111C' }}>
      <HeaderBar
        documentName={doc?.title ?? null}
        onReset={handleReset}
        showReset={uploadState !== 'idle'}
      />

      {uploadState === 'idle' && (
        <>
          <UploadZone onFile={handleFile} onSample={handleSampleDocument} />
          {ingestError && (
            <div
              className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg text-sm max-w-md w-full"
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171',
              }}
            >
              {ingestError}
            </div>
          )}
        </>
      )}

      {uploadState === 'processing' && (
        <ProgressOverlay progress={progress} label={progressLabel} />
      )}

      {uploadState === 'ready' && doc && (
        <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 48px)' }}>
          <DocumentSidebar
            doc={doc}
            activeSection={activeSection}
            highlighted={highlighted}
            onSectionClick={handleSectionClick}
          />
          <ChatPanel
            messages={messages}
            thinking={thinking}
            onQuestion={handleQuestion}
            onCitationClick={handleCitationClick}
          />
        </div>
      )}
    </div>
  )
}
