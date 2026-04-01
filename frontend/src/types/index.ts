export interface Section {
  id: string
  level: 1 | 2
  number: string
  title: string
  page: number
  text: string
  children: Section[]
}

export interface DocumentTree {
  title: string
  totalPages: number
  totalSections: number
  totalSubs: number
  sections: Section[]
}

export interface Citation {
  id: string
  number: string
  title: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
}

export type UploadState = 'idle' | 'processing' | 'ready'

// pdf.js global injected via CDN script in index.html
declare global {
  interface Window {
    pdfjsLib: {
      getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PDFDocumentProxy> }
      GlobalWorkerOptions: { workerSrc: string }
    }
  }
}

interface PDFDocumentProxy {
  numPages: number
  getPage: (pageNum: number) => Promise<PDFPageProxy>
}

interface PDFPageProxy {
  getTextContent: () => Promise<{ items: Array<{ str: string }> }>
}
