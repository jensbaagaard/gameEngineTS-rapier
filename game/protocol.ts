import {
  Hasher,
  boolean,
  canonical,
  integer,
  isPlainObject,
  object,
  string,
  validate,
  type Infer,
  type Patch,
  type Quaternion,
  type Schema,
  type Vector,
} from '../src/index.js';
import { commandSchema } from './movement.js';
import { registry, scenes } from './scene.js';

export const VERSION = 1;
export const CONTENT = fingerprint();

export type Pose = { type: 'player' | 'box'; position: Vector; rotation: Quaternion };
export type PublicState = Record<string, Pose>;

const nonnegative = { ...integer, min: 0 } as const satisfies Schema;
const literal = <V extends string>(value: V) =>
  ({ type: 'string', values: [value] }) as const satisfies Schema;
const schemas = {
  join: object({
    type: literal('join'),
    version: integer,
    content: nonnegative,
    room: { ...string, maxLength: 32 },
    password: { ...string, maxLength: 64 },
    create: boolean,
  }),
  command: object({
    type: literal('command'),
    epoch: nonnegative,
    sequence: { ...integer, min: 1 },
    command: commandSchema,
  }),
  scene: object({
    type: literal('scene'),
    scene: { type: 'string', values: Object.keys(scenes) },
  }),
} satisfies Record<string, Schema>;

export type ClientMessage = Infer<(typeof schemas)[keyof typeof schemas]>;
export type JoinMessage = Infer<typeof schemas.join>;

export interface Snapshot {
  type: 'snapshot';
  epoch: number;
  tick: number;
  scene: string;
  changes: number;
  ack: number;
  patch: Patch;
  events: { type: 'scene'; scene: string }[];
}
export interface Welcome {
  type: 'welcome';
  version: number;
  id: string;
  epoch: number;
  position: Vector;
}
export type ServerMessage = Snapshot | Welcome | { type: 'error'; message: string };

function fingerprint(): number {
  const content = Object.fromEntries(
    Object.entries(scenes).map(([name, scene]) => [
      name,
      { settings: scene.settings, objects: registry.expand(scene) },
    ]),
  );
  return new Hasher().bytes(new TextEncoder().encode(canonical(content))).digest();
}

function isMessageType(type: unknown): type is keyof typeof schemas {
  return typeof type === 'string' && Object.hasOwn(schemas, type);
}

export function parseClientMessage(data: string): ClientMessage {
  const message: unknown = JSON.parse(data);
  const type = isPlainObject(message) ? message.type : undefined;
  if (!isMessageType(type)) throw new Error('Unknown message type');
  validate(schemas[type], message);
  return message;
}
