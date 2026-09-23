import { expectTypeOf, it } from 'vitest';
import { array, integer, nullable, object, string, type Infer } from '../src/index.js';
import type { WorkshopObject } from '../game/scene.js';
import type { ClientMessage } from '../game/protocol.js';

it('infers TypeScript types from schemas', () => {
  const schema = object({
    name: string,
    tags: array(string),
    age: { ...integer, optional: true },
    score: nullable(integer),
  });
  expectTypeOf<Infer<typeof schema>>().toEqualTypeOf<{
    name: string;
    tags: string[];
    age?: number;
    score: number | null;
  }>();
  expectTypeOf<Extract<WorkshopObject, { type: 'box' }>['settings']>().toEqualTypeOf<{
    position: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
    color: string;
  }>();
  expectTypeOf<Extract<ClientMessage, { type: 'scene' }>>().toEqualTypeOf<{
    type: 'scene';
    scene: string;
  }>();
});
