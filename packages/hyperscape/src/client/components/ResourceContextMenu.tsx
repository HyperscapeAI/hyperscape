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
      <div 
        ref={menuRef} 
        className="fixed z-[10000] bg-[rgba(11,10,21,0.95)] border border-white/20 rounded-lg py-2 min-w-[160px] backdrop-blur-xl pointer-events-auto animate-[fadeIn_0.15s_ease-out]"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 16px rgba(0, 255, 127, 0.1)',
        }}
      >
        {targetType && (
          <div className="py-2 px-4 border-b border-white/10 mb-1 font-medium text-[0.8125rem] text-[rgba(0,255,127,0.9)] capitalize">
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
            className={`resource-menu-item w-full py-2.5 px-4 border-none bg-transparent text-left text-sm flex items-center gap-3 transition-all duration-200 font-sans outline-none ${
            action.enabled ? 'text-white/90 cursor-pointer' : 'text-white/40 cursor-not-allowed'
          }`}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            {action.icon && (
              <span className={`text-xl ${action.enabled ? '' : 'grayscale'}`}>{action.icon}</span>
            )}
            <span>{action.label}</span>
          </button>
        ))}
        {targetId && (
          <div className="py-1 px-4 border-t border-white/10 mt-1 text-xs text-white/50 italic">
            ID: {targetId}
          </div>
        )}
      </div>
    </>
  );
}


