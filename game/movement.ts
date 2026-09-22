import { object, number } from '../src/index.js';
import type { Vector } from './scene.js';

export const TPS = 60;
export interface Command { x: number; z: number }
export const commandSchema = object({ x: { ...number, min: -1, max: 1 }, z: { ...number, min: -1, max: 1 } });
export const idle = (): Command => ({ x: 0, z: 0 });
export function move(position: Vector, command: Command): void {
  const length = Math.max(1, Math.sqrt(command.x * command.x + command.z * command.z));
  position.x = Math.max(-11, Math.min(11, position.x + command.x * 5 / TPS / length));
  position.z = Math.max(-11, Math.min(11, position.z + command.z * 5 / TPS / length));
}
