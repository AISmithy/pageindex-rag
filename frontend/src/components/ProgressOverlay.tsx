import React from 'react'

interface ProgressOverlayProps {
  progress: number
  label: string
}

export default function ProgressOverlay({ progress, label }: ProgressOverlayProps) {
  return (
    <main className="flex flex-col items-center justify-center min-h-[calc(100vh-48px)] px-4">
      <div className="w-full max-w-md">
        {/* Icon */}
        <div className="text-center mb-8">
          <span className="text-5xl" style={{ color: '#D97706' }}>◈</span>
          <h2
            className="mt-4 text-base font-semibold"
            style={{ color: '#e2e8f0', fontFamily: 'SF Mono, Fira Code, monospace' }}
          >
            Building PageIndex Tree
          </h2>
        </div>

        {/* Progress bar */}
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: '6px', background: '#112236' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #b45309, #D97706, #fbbf24)',
            }}
          />
        </div>

        {/* Label */}
        <p
          className="mt-3 text-sm text-center"
          style={{ color: '#64748b', fontFamily: 'SF Mono, Fira Code, monospace' }}
        >
          {label || 'Initialising...'}
        </p>

        {/* Progress percentage */}
        <p
          className="mt-1 text-xs text-center"
          style={{ color: '#334155' }}
        >
          {Math.round(progress)}%
        </p>

        {/* Step indicators */}
        <div className="mt-8 flex justify-center gap-2">
          {['Reading', 'Headings', 'Tree', 'Text', 'Done'].map((step, i) => (
            <div
              key={step}
              className="flex flex-col items-center gap-1"
            >
              <div
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  background: progress >= (i + 1) * 20 ? '#D97706' : '#1e3a5f',
                  boxShadow: progress >= (i + 1) * 20 ? '0 0 6px rgba(217,119,6,0.5)' : 'none',
                }}
              />
              <span className="text-xs" style={{ color: progress >= (i + 1) * 20 ? '#D97706' : '#1e3a5f', fontSize: '9px' }}>
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
