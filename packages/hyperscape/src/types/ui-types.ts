/**
 * UI-related type definitions
 * 
 * Shared types for UI elements and interfaces
 */

import * as THREE from '../extras/three'
import type { ReactNode, CSSProperties } from 'react'
import type { World } from './index'
import type { Curve } from '../extras/Curve'

// Nametag interfaces
export interface Nametag {
  idx: number
  name: string
  health: number
  matrix: THREE.Matrix4
  move: (newMatrix: THREE.Matrix4) => void
  setName: (name: string) => void
  setHealth: (health: number) => void
  destroy: () => void
}

// Equipment UI interfaces
export interface PlayerWithEquipmentSupport {
  position: THREE.Vector3
  getBoneTransform: (boneName: string) => THREE.Matrix4
}

// Action test interfaces (for item interaction testing)
export interface ActionTestData {
  testId: string
  itemId: string
  itemType: string
  playerId: string
  startTime: number
  phase: 'setup' | 'right_click' | 'verify_menu' | 'test_actions' | 'verify_results' | 'completed' | 'failed'
  rightClicked: boolean
  menuShown: boolean
  actionsAvailable: string[]
  actionsExpected: string[]
  actionsTested: string[]
  actionsSuccessful: string[]
  menuDisappeared: boolean
  visualFeedbackReceived: boolean
  errors: string[]
}

// Context menu interfaces
export interface ContextMenuAction {
  id: string
  label: string
  icon?: string
  enabled: boolean
  onClick: () => void
}

export interface ContextMenuProps {
  visible: boolean
  position: { x: number; y: number }
  actions: ContextMenuAction[]
  onClose: () => void
  title?: string
}

// Draggable window interfaces
export interface DraggableWindowProps {
  children: ReactNode
  initialPosition?: { x: number; y: number }
  dragHandle?: ReactNode
  onPositionChange?: (position: { x: number; y: number }) => void
  className?: string
  style?: CSSProperties
  enabled?: boolean
}

// Curve component interfaces
export interface CurvePaneProps {
  curve: Curve;
  xLabel: string;
  xRange?: [number, number];
  yLabel: string;
  yMin: number;
  yMax: number;
  onCommit: () => void;
  onCancel: () => void;
}

export interface CurvePreviewProps {
  curve: Curve;
  width?: number;
  height?: number;
  xRange?: [number, number];
  yMin?: number;
  yMax?: number;
}

// Hint system interfaces
export interface HintContextType {
  hint: string | null;
  setHint: (hint: string | null) => void;
}

export interface HintProviderProps {
  children: ReactNode;
}

// Field component interfaces
export interface FieldTextProps {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export interface FieldTextareaProps {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

export interface SwitchOption {
  label: string;
  value: unknown;
}

export interface FieldSwitchProps {
  label: string;
  hint?: string;
  options: SwitchOption[];
  value: unknown;
  onChange: (value: unknown) => void;
}

export interface FieldToggleProps {
  label: string;
  hint?: string;
  trueLabel?: string;
  falseLabel?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export interface FieldRangeProps {
  label: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  instant?: boolean;
  value: number;
  onChange: (value: number) => void;
}

export interface FieldFileProps {
  world: World;
  label: string;
  hint?: string;
  kind: keyof typeof _fileKinds;
  value: unknown;
  onChange: (value: unknown) => void;
}

export interface FieldNumberProps {
  label: string;
  hint?: string;
  dp?: number;
  min?: number;
  max?: number;
  step?: number;
  bigStep?: number;
  value: number;
  onChange: (value: number) => void;
}

export interface FieldVec3Props {
  label: string;
  hint?: string;
  dp?: number;
  min?: number;
  max?: number;
  step?: number;
  bigStep?: number;
  value: number[];
  onChange: (value: number[]) => void;
}

export interface FieldCurveProps {
  label: string;
  hint?: string;
  x: string;
  xRange?: number;
  y: string;
  yMin: number;
  yMax: number;
  value: string;
  onChange: (value: string) => void;
}

export interface FieldBtnProps {
  label: string;
  note?: string;
  hint?: string;
  nav?: boolean;
  onClick: () => void;
}

// FileKinds placeholder - this should be imported from the actual definition
declare const _fileKinds: Record<string, unknown>;