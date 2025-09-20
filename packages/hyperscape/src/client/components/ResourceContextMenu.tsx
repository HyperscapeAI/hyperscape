import React, { useEffect, useRef } from 'react';

export interface ResourceAction {
  id: string;
  label: string;
  icon?: string;
  enabled: boolean;
  onClick: () => void;
}

export interface ResourceContextMenuProps {
  visible: boolean;
  position: { x: number; y: number };
  actions: ResourceAction[];
  targetId?: string;
  targetType?: string;
  onClose: () => void;
}

export function ResourceContextMenu({ 
  visible, 
  position, 
  actions, 
  targetId,
  targetType,
  onClose 
}: ResourceContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible || actions.length === 0) return null;

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    zIndex: 10000,
    backgroundColor: 'rgba(11, 10, 21, 0.95)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    padding: '0.5rem 0',
    minWidth: '160px',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(0, 255, 127, 0.1)',
    pointerEvents: 'auto',
    animation: 'fadeIn 0.15s ease-out'
  };

  const titleStyle: React.CSSProperties = {
    padding: '0.5rem 1rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    marginBottom: '0.25rem',
    fontWeight: '500',
    fontSize: '0.8125rem',
    color: 'rgba(0, 255, 127, 0.9)',
    textTransform: 'capitalize'
  };

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: scale(0.95) translateY(-5px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }

          .resource-menu-item:hover {
            background: linear-gradient(90deg, 
              rgba(0, 255, 127, 0.15) 0%, 
              rgba(0, 255, 127, 0.05) 100%);
          }
        `}
      </style>
      <div ref={menuRef} style={menuStyle}>
        {targetType && (
          <div style={titleStyle}>
            {targetType.replace(/_/g, ' ')}
          </div>
        )}
        {actions.map(action => (
          <button
            key={action.id}
            disabled={!action.enabled}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (action.enabled) {
                action.onClick();
                onClose();
              }
            }}
            className="resource-menu-item"
            style={{
              width: '100%',
              padding: '0.625rem 1rem',
              border: 'none',
              background: 'transparent',
              color: action.enabled ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.4)',
              textAlign: 'left',
              cursor: action.enabled ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              transition: 'all 0.2s ease',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              outline: 'none'
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            {action.icon && (
              <span style={{ 
                fontSize: '1.25rem',
                filter: action.enabled ? 'none' : 'grayscale(100%)'
              }}>{action.icon}</span>
            )}
            <span>{action.label}</span>
          </button>
        ))}
        {targetId && (
          <div style={{
            padding: '0.25rem 1rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            marginTop: '0.25rem',
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.5)',
            fontStyle: 'italic'
          }}>
            ID: {targetId}
          </div>
        )}
      </div>
    </>
  );
}


