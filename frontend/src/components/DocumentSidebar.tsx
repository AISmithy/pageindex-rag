import React from 'react'
import { DocumentTree, Section } from '../types'
import TreeNode from './TreeNode'
import SectionDetail from './SectionDetail'

interface DocumentSidebarProps {
  doc: DocumentTree
  activeSection: string | null
  highlighted: Set<string>
  onSectionClick: (id: string) => void
}

function findSection(sections: Section[], id: string): Section | null {
  for (const s of sections) {
    if (s.id === id) return s
    const found = findSection(s.children, id)
    if (found) return found
  }
  return null
}

export default function DocumentSidebar({
  doc,
  activeSection,
  highlighted,
  onSectionClick,
}: DocumentSidebarProps) {
  const selectedSection = activeSection ? findSection(doc.sections, activeSection) : null

  const handleSectionClick = (id: string) => {
    onSectionClick(id)
  }

  const handleClose = () => {
    onSectionClick(activeSection!) // toggles off
  }

  return (
    <aside
      className="flex flex-col border-r shrink-0"
      style={{
        width: '240px',
        background: '#07111C',
        borderColor: '#112236',
      }}
    >
      {/* Document statistics strip */}
      <div
        className="px-3 py-3 border-b"
        style={{ borderColor: '#112236' }}
      >
        <p
          className="text-xs font-bold truncate mb-2"
          style={{ color: '#e2e8f0', fontFamily: 'SF Mono, Fira Code, monospace' }}
          title={doc.title}
        >
          {doc.title}
        </p>
        <div className="flex gap-3">
          <Stat label="pages" value={doc.totalPages} />
          <Stat label="sections" value={doc.totalSections} />
          <Stat label="subs" value={doc.totalSubs} />
        </div>
      </div>

      {/* Tree view */}
      <div className="flex-1 overflow-y-auto py-2">
        {doc.sections.map(section => (
          <TreeNode
            key={section.id}
            section={section}
            activeSection={activeSection}
            highlighted={highlighted}
            depth={0}
            onSelect={handleSectionClick}
          />
        ))}
      </div>

      {/* Section detail drawer */}
      {selectedSection && (
        <SectionDetail
          section={selectedSection}
          onClose={handleClose}
        />
      )}
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span
        className="text-sm font-bold"
        style={{ color: '#D97706', fontFamily: 'SF Mono, Fira Code, monospace' }}
      >
        {value}
      </span>
      <span className="text-xs" style={{ color: '#334155', fontSize: '9px' }}>
        {label}
      </span>
    </div>
  )
}
