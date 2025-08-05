/**
 * Shared utilities for test systems
 */

import * as THREE from '../extras/three';

export interface TestVisual {
  mesh: THREE.Mesh;
  type: string;
  color: number;
  position: { x: number; y: number; z: number };
}

export interface TestColors {
  player: number;
  mob: number;
  item: number;
  resource: number;
  npc: number;
  waypoint: number;
  obstacle: number;
  barrier: number;
  teleportTarget: number;
  zone: number;
  success: number;
  failure: number;
  warning: number;
  info: number;
}

export const TEST_COLORS: TestColors = {
  player: 0x0000ff,      // Blue
  mob: 0xff0000,         // Red  
  item: 0xffff00,        // Yellow
  resource: 0x00ff00,    // Green
  npc: 0xff00ff,         // Magenta
  waypoint: 0x00ffff,    // Cyan
  obstacle: 0x808080,    // Gray
  barrier: 0x404040,     // Dark gray
  teleportTarget: 0xff8000, // Orange
  zone: 0x8080ff,        // Light blue
  success: 0x00ff00,     // Green
  failure: 0xff0000,     // Red
  warning: 0xffff00,     // Yellow
  info: 0x0080ff,        // Blue
};

/**
 * Create a test cube mesh with specified color
 */
export function createTestCube(
  color: number, 
  size: number = 1,
    options?: {
    opacity?: number;
    transparent?: boolean;
  }
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size, size, size);
  const material = new THREE.MeshBasicMaterial({
    color,
    opacity: options?.opacity ?? 1,
    transparent: options?.transparent ?? false,
  });
  
  return new THREE.Mesh(geometry, material);
}

/**
 * Create a test sphere mesh
 */
export function createTestSphere(
  color: number,
  radius: number = 0.5,
  options?: {
    opacity?: number;
    transparent?: boolean;
  }
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color,
    opacity: options?.opacity ?? 1,
    transparent: options?.transparent ?? false,
  });
  
  return new THREE.Mesh(geometry, material);
}

/**
 * Create a test cylinder (useful for waypoints/markers)
 */
export function createTestCylinder(
  color: number,
  radius: number = 0.5,
  height: number = 2,
  options?: {
    opacity?: number;
    transparent?: boolean;
  }
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 16);
  const material = new THREE.MeshBasicMaterial({
    color,
    opacity: options?.opacity ?? 1,
    transparent: options?.transparent ?? false,
  });
  
  return new THREE.Mesh(geometry, material);
}

/**
 * Create a test zone indicator (flat plane)
 */
export function createTestZone(
  color: number,
  width: number,
  depth: number,
  options?: {
    opacity?: number;
    height?: number;
  }
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshBasicMaterial({
    color,
    opacity: options?.opacity ?? 0.3,
    transparent: true,
    side: THREE.DoubleSide,
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2; // Make it horizontal
  mesh.position.y = options?.height ?? 0.1;
  
  return mesh;
}

/**
 * Create a test path line
 */
export function createTestPath(
  points: Array<{ x: number; y: number; z: number }>,
  color: number = TEST_COLORS.info
): THREE.Line {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(points.length * 3);
  
  points.forEach((point, index) => {
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.y;
    positions[index * 3 + 2] = point.z;
  });
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color });
  
  return new THREE.Line(geometry, material);
}

/**
 * Update mesh color
 */
export function updateMeshColor(mesh: THREE.Mesh, color: number): void {
  if (mesh.material && 'color' in mesh.material) {
    (mesh.material as THREE.MeshBasicMaterial).color.set(color);
  }
}

/**
 * Flash a mesh color temporarily
 */
export function flashMeshColor(
  mesh: THREE.Mesh, 
  flashColor: number, 
  duration: number = 500
): void {
  const originalColor = mesh.material && 'color' in mesh.material 
    ? (mesh.material as THREE.MeshBasicMaterial).color.getHex()
    : 0xffffff;
    
  updateMeshColor(mesh, flashColor);
  
  setTimeout(() => {
    updateMeshColor(mesh, originalColor);
  }, duration);
}

/**
 * Create a labeled test object
 */
export function createLabeledTestObject(
  label: string,
  position: { x: number; y: number; z: number },
  color: number = TEST_COLORS.info
): { mesh: THREE.Mesh; label: string } {
  const mesh = createTestCube(color);
  mesh.position.set(position.x, position.y, position.z);
  mesh.name = label;
  
  // In a real implementation, you might add a text label above the mesh
  // For now, we just store it as metadata
  
  return { mesh, label };
}

/**
 * Calculate test metrics
 */
export interface TestMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  successCount: number;
  failureCount: number;
  warningCount: number;
  completionRate?: number;
}

export function createTestMetrics(): TestMetrics {
  return {
    startTime: Date.now(),
    successCount: 0,
    failureCount: 0,
    warningCount: 0,
  };
}

export function finalizeTestMetrics(metrics: TestMetrics): TestMetrics {
  metrics.endTime = Date.now();
  metrics.duration = metrics.endTime - metrics.startTime;
  
  const total = metrics.successCount + metrics.failureCount;
  metrics.completionRate = total > 0 ? metrics.successCount / total : 0;
  
  return metrics;
}

/**
 * Format test results for display
 */
export function formatTestResults(metrics: TestMetrics): string {
  const duration = metrics.duration ? `${metrics.duration}ms` : 'ongoing';
  const rate = metrics.completionRate !== undefined 
    ? `${(metrics.completionRate * 100).toFixed(1)}%` 
    : 'N/A';
    
  return [
    `Duration: ${duration}`,
    `Success: ${metrics.successCount}`,
    `Failure: ${metrics.failureCount}`,
    `Warning: ${metrics.warningCount}`,
    `Success Rate: ${rate}`
  ].join(' | ');
}