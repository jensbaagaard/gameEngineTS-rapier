// The wire format between the demo server and its clients.
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

export const VERSION = 1; // bump when messages change; server and client must agree
// Hash of every expanded scene. A client with different content is refused at join.
export const CONTENT = fingerprint();

// One object as the server publishes it each tick; the rotation is a quaternion like Rapier's.
export type Pose = { type: 'player' | 'box'; position: Vector; rotation: Quaternion };
// Everything a client is allowed to see, keyed by object id. Server-only details never enter it.
export type PublicState = Record<string, Pose>;

const nonnegative = { ...integer, min: 0 } as const satisfies Schema;
const literal = <V extends string>(value: V) =>
  ({ type: 'string', values: [value] }) as const satisfies Schema;
// Client messages use the same schema machinery as scene files; their types are inferred too.
const schemas = {
  // Enter or create a room. Version and content are checked before anything else.
  join: object({
    type: literal('join'),
    version: integer,
    content: nonnegative,
    room: { ...string, maxLength: 32 },
    password: { ...string, maxLength: 64 },
    create: boolean,
  }),
  // One tick of input, numbered so the server can tell the client how far it has applied.
  command: object({
    type: literal('command'),
    epoch: nonnegative,
    sequence: { ...integer, min: 1 },
    command: commandSchema,
  }),
  // Ask the room to load another scene.
  scene: object({
    type: literal('scene'),
    scene: { type: 'string', values: Object.keys(scenes) },
  }),
} satisfies Record<string, Schema>;

export type ClientMessage = Infer<(typeof schemas)[keyof typeof schemas]>;
export type JoinMessage = Infer<typeof schemas.join>;

// Sent after every tick. The patch holds only what changed since the client's last snapshot.
export interface Snapshot {
  type: 'snapshot';
  epoch: number; // counts scene changes; commands sent for an older epoch are ignored
  tick: number;
  scene: string;
  changes: number;
  ack: number; // sequence of the last command the server applied for this client
  patch: Patch;
  events: { type: 'scene'; scene: string }[];
}
// Sent once after a successful join.
export interface Welcome {
  type: 'welcome';
  version: number;
  id: string;
  epoch: number;
  position: Vector;
}
export type ServerMessage = Snapshot | Welcome | { type: 'error'; message: string };

// Hashes canonical (sorted-key) JSON of every scene, so builds compare content byte for byte.
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

// Parses and validates one client message; anything unexpected throws before it reaches a room.
export function parseClientMessage(data: string): ClientMessage {
  const message: unknown = JSON.parse(data);
  const type = isPlainObject(message) ? message.type : undefined;
  if (!isMessageType(type)) throw new Error('Unknown message type');
  validate(schemas[type], message);
  return message;
}
