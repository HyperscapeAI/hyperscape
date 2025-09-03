import React, { useEffect, useRef } from 'react'
import type { ContextMenuProps } from '../../types/ui-types'

export function ContextMenu({ visible, position, actions, onClose, title }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (visible) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible, onClose])

  if (!visible) return null

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    background: 'rgba(11, 10, 21, 0.95)',
    border: '0.0625rem solid #2a2b39',
    backdropFilter: 'blur(5px)',
    borderRadius: '0.5rem',
    padding: '0.5rem 0',
    minWidth: '150px',
    zIndex: 2000,
    fontSize: '0.875rem',
    color: 'rgba(255, 255, 255, 0.9)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'auto'
  }

  return (
    <div ref={menuRef} style={menuStyle}>
      {title && (
        <div style={{
          padding: '0.5rem 1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '0.25rem',
          fontWeight: '500',
          fontSize: '0.8125rem',
          color: 'rgba(255, 255, 255, 0.7)'
        }}>
          {title}
        </div>
      )}
      {actions.map(action => (
        <button
          key={action.id}
          disabled={!action.enabled}
          onClick={(e) => {
            // Prevent bubbling to canvas/document which could trigger movement
            e.stopPropagation()
            if (action.enabled) {
              action.onClick()
              onClose()
            }
          }}
          style={{
            width: '100%',
            padding: '0.5rem 1rem',
            border: 'none',
            background: 'transparent',
            color: action.enabled ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.4)',
            textAlign: 'left',
            cursor: action.enabled ? 'pointer' : 'not-allowed',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'background-color 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (action.enabled) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          onMouseDown={(e) => {
            // Prevent this click from bubbling to the canvas/document and triggering movement
            e.stopPropagation()
          }}
        >
          {action.icon && (
            <span style={{ fontSize: '1rem' }}>{action.icon}</span>
          )}
          {action.label}
        </button>
      ))}
    </div>
  )
}