import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import * as THREE_NAMESPACE from 'three';

// Multiple imports of Three.js are expected in this module architecture
// The globalThis.THREE ensures we're using a singleton instance

// Re-export THREE namespace and all named exports
export * from 'three';
// Also export the namespace as default to ensure consistency
export default THREE_NAMESPACE;

// Vector3 compatibility utilities
export function toTHREEVector3(v: THREE_NAMESPACE.Vector3 | { x: number; y: number; z: number }): THREE_NAMESPACE.Vector3 {
  return new THREE_NAMESPACE.Vector3(v.x, v.y, v.z);
}

// Utility to ensure Matrix decompose operations work correctly
export function safeMatrixDecompose(
  matrix: THREE_NAMESPACE.Matrix4, 
  position: THREE_NAMESPACE.Vector3, 
  quaternion: THREE_NAMESPACE.Quaternion, 
  scale: THREE_NAMESPACE.Vector3
): void {
  const tempPos = new THREE_NAMESPACE!.Vector3();
  const tempQuat = new THREE_NAMESPACE!.Quaternion(); 
  const tempScale = new THREE_NAMESPACE!.Vector3();
  
  matrix.decompose(tempPos, tempQuat, tempScale);
  
  position.copy(tempPos);
  quaternion.copy(tempQuat);
  scale.copy(tempScale);
}

// Utility for Matrix compose operations  
export function safeMatrixCompose(
  matrix: THREE_NAMESPACE.Matrix4,
  position: THREE_NAMESPACE.Vector3 | { x: number; y: number; z: number },
  quaternion: THREE_NAMESPACE.Quaternion | { x: number; y: number; z: number; w: number },
  scale: THREE_NAMESPACE.Vector3 | { x: number; y: number; z: number }
): void {
  const pos = toTHREEVector3(position);
  const quat = quaternion instanceof THREE_NAMESPACE!.Quaternion ? quaternion : new THREE_NAMESPACE!.Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  const scl = toTHREEVector3(scale);
  matrix.compose(pos, quat, scl);
}

// Explicit exports are not needed since we already have export * from 'three'
// The duplicate exports were causing TypeScript declaration generation to crash

// PhysX Vector3 utilities are now in vector3-utils.ts

// Module augmentation for three
declare module 'three' {
  interface InstancedMesh {
    resize(size: number): void
  }
}

// install three-mesh-bvh
THREE_NAMESPACE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE_NAMESPACE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE_NAMESPACE.Mesh.prototype.raycast = acceleratedRaycast

// THREE is available globally, no need to export it separately


// utility to resize instanced mesh buffers
  THREE_NAMESPACE.InstancedMesh.prototype.resize = function (size: number) {
        const prevSize = this.instanceMatrix.array.length / 16
        if (size <= prevSize) return
        const array = new Float32Array(size * 16)
        array.set(this.instanceMatrix.array)
        this.instanceMatrix = new THREE_NAMESPACE!.InstancedBufferAttribute(array, 16)
        this.instanceMatrix.needsUpdate = true
}
