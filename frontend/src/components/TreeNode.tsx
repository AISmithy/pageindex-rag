import React from 'react'
import { Section } from '../types'

interface TreeNodeProps {
  section: Section
  activeSection: string | null
  highlighted: Set<string>
  depth: number
  onSelect: (id: string) => void
}

export default function TreeNode({
  section,
  activeSection,
  highlighted,
  depth,
  onSelect,
}: TreeNodeProps) {
  const isActive = activeSection === section.id
  const isCited = highlighted.has(section.id)

  return (
    <div>
      {/* Section row */}
      <button
        onClick={() => onSelect(section.id)}
        className="w-full text-left flex items-start gap-2 px-3 py-1.5 rounded transition-all duration-200 group"
        style={{
          paddingLeft: `${8 + depth * 12}px`,
          background: isActive
            ? 'rgba(217, 119, 6, 0.12)'
            : isCited
            ? 'rgba(134, 239, 172, 0.07)'
            : 'transparent',
          borderLeft: isActive
            ? '2px solid #D97706'
            : isCited
            ? '2px solid rgba(134, 239, 172, 0.5)'
            : '2px solid transparent',
        }}
      >
        {/* Section number */}
        <span
          className="shrink-0 text-xs font-bold mt-0.5"
          style={{
            fontFamily: 'SF Mono, Fira Code, monospace',
            color: isActive ? '#D97706' : isCited ? '#86EFAC' : '#334155',
            minWidth: depth === 0 ? '24px' : '32px',
          }}
        >
          {section.number}
        </span>

        {/* Title */}
        <span
          className="text-xs leading-relaxed line-clamp-2"
          style={{
            color: isActive ? '#e2e8f0' : isCited ? '#86EFAC' : '#94a3b8',
          }}
        >
          {section.title}
        </span>

        {/* Cited indicator */}
        {isCited && (
          <span
            className="shrink-0 mt-0.5 text-xs"
            style={{ color: '#86EFAC' }}
            title="Cited in last answer"
          >
            ●
          </span>
        )}
      </button>

      {/* Children */}
      {section.children.map(child => (
        <TreeNode
          key={child.id}
          section={child}
          activeSection={activeSection}
          highlighted={highlighted}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
