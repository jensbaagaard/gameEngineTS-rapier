// How a player moves. Plain arithmetic, so the client predicts exactly what the server computes.
import { object, number, type Infer, type Vector } from '../src/index.js';

export const TPS = 60; // simulation ticks per second, shared by the server and every client
const SPEED = 5; // meters per second
const ARENA_BOUND = 11; // players cannot walk further than this from the center, in meters

// One tick of input: a direction on the ground plane, each axis between -1 and 1.
export const commandSchema = object({
  x: { ...number, min: -1, max: 1 },
  z: { ...number, min: -1, max: 1 },
});
export type Command = Infer<typeof commandSchema>;

export const idle = (): Command => ({ x: 0, z: 0 });

// One tick of movement. Diagonal input is normalized so it is not faster than straight input.
export function move(position: Vector, command: Command): void {
  const length = Math.max(1, Math.sqrt(command.x * command.x + command.z * command.z));
  position.x = clamp(position.x + (command.x * SPEED) / TPS / length);
  position.z = clamp(position.z + (command.z * SPEED) / TPS / length);
}

const clamp = (value: number): number => Math.max(-ARENA_BOUND, Math.min(ARENA_BOUND, value));
