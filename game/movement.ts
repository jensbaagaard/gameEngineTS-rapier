import { object, number, type Infer } from '../src/index.js';
import type { Vector } from './scene.js';

export const TPS = 60;
const SPEED = 5;
const ARENA_BOUND = 11;

export const commandSchema = object({
  x: { ...number, min: -1, max: 1 },
  z: { ...number, min: -1, max: 1 },
});
export type Command = Infer<typeof commandSchema>;

export const idle = (): Command => ({ x: 0, z: 0 });

export function move(position: Vector, command: Command): void {
  const length = Math.max(1, Math.sqrt(command.x * command.x + command.z * command.z));
  position.x = clamp(position.x + (command.x * SPEED) / TPS / length);
  position.z = clamp(position.z + (command.z * SPEED) / TPS / length);
}

const clamp = (value: number): number => Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, value));
