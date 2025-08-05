/**
 * UI Component types
 * 
 * These types are used across various UI components and windows
 * for consistent prop interfaces and shared functionality.
 */

import type * as THREE from '../extras/three';
import type { World } from '../World';

/**
 * Base window component props
 */
export interface WindowProps {
  world: World;
  visible: boolean;
  onClose: () => void;
}

/**
 * Window with entity ID prop
 */
export interface EntityWindowProps extends WindowProps {
  entityId?: string;
}

/**
 * Bank window specific props
 */
export interface BankWindowProps extends EntityWindowProps {
  bankId?: string;
}

/**
 * Store window specific props
 */
export interface StoreWindowProps extends EntityWindowProps {
  storeId?: string;
}

/**
 * Input component base props
 */
export interface InputBaseProps {
  label?: string;
  disabled?: boolean;
}

/**
 * Text input props
 */
export interface InputTextProps extends InputBaseProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Textarea input props
 */
export interface InputTextareaProps extends InputTextProps {
  rows?: number;
}

/**
 * Number input props
 */
export interface InputNumberProps extends InputBaseProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Range input props
 */
export interface InputRangeProps extends InputNumberProps {
  // Same as InputNumberProps
}

/**
 * Switch/toggle input props
 */
export interface InputSwitchProps extends InputBaseProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

/**
 * Dropdown input props
 */
export interface InputDropdownProps extends InputBaseProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

/**
 * File input props
 */
export interface InputFileProps extends InputBaseProps {
  value: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  placeholder?: string;
}

/**
 * Menu context interface
 */
export interface MenuContextType {
  setHint: (hint: string | null) => void;
}

/**
 * Context menu state
 */
export interface ContextMenuState {
  visible: boolean;
  position: { x: number; y: number };
  target: unknown;
}

/**
 * Item context menu for inventory actions
 */
export interface ItemContextMenu {
  visible: boolean;
  position: { x: number; y: number };
  item: unknown | null;
}

/**
 * Entity pip for minimap/radar display
 */
export interface EntityPip {
  id: string;
  type: 'player' | 'enemy' | 'building' | 'item';
  position: THREE.Vector3;
  color: string;
}

/**
 * Minimap component props
 */
export interface MinimapProps {
  world: World;
  width?: number;
  height?: number;
  zoom?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Hierarchy node for tree display
 */
export interface HierarchyNode {
  id?: string;
  name?: string;
  constructor?: { name: string };
  children?: HierarchyNode[];
  position?: { x: number; y: number; z: number } | { getHexString?: () => string };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  material?: {
    type?: string;
    color?: {
      getHexString?: () => string;
    };
  };
  geometry?: {
    type?: string;
  };
}

/**
 * Parse result for safe math parsing
 */
export interface ParseResult {
  success: boolean;
  value: number;
  error?: string;
}

/**
 * Pane information for UI panels
 */
export interface PaneInfo {
  v: number;
  count: number;
  configs: Record<string, unknown>;
}