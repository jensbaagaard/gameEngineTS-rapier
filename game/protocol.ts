import { Hasher, canonical, integer, object, string, validate, type Patch, type Schema } from '../src/index.js';
import { commandSchema, type Command } from './movement.js';
import { registry, scenes, type Vector } from './scene.js';

export const VERSION = 1;
const content = Object.fromEntries(Object.entries(scenes).map(([name, scene]) => [name, {
  settings: scene.settings, objects: registry.expand(scene).map(entry => ({ ...entry })),
}]));
export const CONTENT = new Hasher().bytes(new TextEncoder().encode(canonical(content))).digest();
export type ClientMessage =
  | { type: 'join'; version: number; content: number; room: string; password: string; create: boolean }
  | { type: 'command'; epoch: number; sequence: number; command: Command }
  | { type: 'scene'; scene: string };
export interface Snapshot {
  type: 'snapshot'; epoch: number; tick: number; scene: string; changes: number; ack: number;
  patch: Patch; events: { type: 'scene'; scene: string }[];
}
export type ServerMessage = Snapshot
  | { type: 'welcome'; version: number; id: string; epoch: number; position: Vector }
  | { type: 'error'; message: string };

const nonnegative: Schema = { ...integer, min: 0 };
const schemas: Record<string, Schema> = {
  join: object({ type: { type: 'string', values: ['join'] }, version: integer, content: nonnegative, room: { ...string, maxLength: 32 }, password: { ...string, maxLength: 64 }, create: { type: 'boolean' } }),
  command: object({ type: { type: 'string', values: ['command'] }, epoch: nonnegative, sequence: { ...integer, min: 1 }, command: commandSchema }),
  scene: object({ type: { type: 'string', values: ['scene'] }, scene: { type: 'string', values: Object.keys(scenes) } }),
};

export function parseClientMessage(data: string): ClientMessage {
  const message: unknown = JSON.parse(data);
  if (!message || typeof message !== 'object' || !('type' in message) || typeof message.type !== 'string' || !Object.hasOwn(schemas, message.type)) throw new Error('Unknown message type');
  validate(schemas[message.type]!, message);
  return message as ClientMessage;
}
