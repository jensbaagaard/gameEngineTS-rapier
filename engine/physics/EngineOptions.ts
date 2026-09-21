import type { Vector } from "@dimforge/rapier2d-compat";

export interface EngineOptions {
  gravity: Vector;
  lengthUnit: number;
}

export const defaultEngineOptions: EngineOptions = {
  gravity: { x: 0, y: 981 },
  lengthUnit: 100,
};
