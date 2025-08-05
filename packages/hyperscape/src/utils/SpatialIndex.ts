import { Vector3 } from '../extras/three';
import type { SpatialEntity } from '../types/ground-types';

export class SpatialIndex {
  private grid: Map<string, SpatialEntity[]> = new Map();
  private cellSize: number;

  constructor(cellSize = 10) {
    this.cellSize = cellSize;
  }

  private getKey(position: Vector3): string {
    const x = Math.floor(position.x / this.cellSize);
    const y = Math.floor(position.z / this.cellSize);
    return `${x},${y}`;
  }

  add(entity: SpatialEntity): void {
    const key = this.getKey(entity.position);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(entity);
  }

  remove(entity: SpatialEntity): void {
    const key = this.getKey(entity.position);
    if (this.grid.has(key)) {
      const cell = this.grid.get(key)!;
      const index = cell.findIndex((e) => e.id === entity.id);
      if (index !== -1) {
        cell.splice(index, 1);
      }
    }
  }

  getNearby(position: Vector3, range: number): SpatialEntity[] {
    const nearby: SpatialEntity[] = [];
    const minX = Math.floor((position.x - range) / this.cellSize);
    const maxX = Math.floor((position.x + range) / this.cellSize);
    const minZ = Math.floor((position.z - range) / this.cellSize);
    const maxZ = Math.floor((position.z + range) / this.cellSize);

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x},${z}`;
        if (this.grid.has(key)) {
          nearby.push(...this.grid.get(key)!);
        }
      }
    }

    return nearby.filter(entity => entity.position.distanceTo(position) <= range);
  }
} 