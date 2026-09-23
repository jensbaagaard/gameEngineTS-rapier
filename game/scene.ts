// The demo's content: the object types a scene may contain, their settings and the scene files.
import {
  SceneRegistry,
  integer,
  number,
  object,
  string,
  transform,
  vector,
  type Schema,
  type Vector,
} from '../src/index.js';
import workshop from './workshop.json';
import courtyard from './courtyard.json';

// Players are kinematic boxes of this size, in meters.
export const PLAYER_SIZE: Vector = { x: 0.9, y: 1.5, z: 0.9 };

// A schema is both a validation rule and a TypeScript type; the engine infers the type from it.
const positive = { type: 'number', min: 0.01, max: 100, unit: 'm' } as const satisfies Schema;
const size = object({ x: positive, y: positive, z: positive });
const acceleration = { type: 'number', unit: 'm/s²' } as const satisfies Schema;
// A block is placed by its transform: position in meters and an optional rotation in degrees.
const block = object({ ...transform, size, color: string });
// A prop is a model file drawn and collided as is, scaled uniformly.
const prop = object({ ...transform, model: string, scale: { ...number, min: 0.01, max: 100 } });

// The registry knows every allowed type and validates object settings against its schema.
export const registry = new SceneRegistry(
  {
    ground: block, // static: a bare collider that never moves
    box: block, // dynamic: a rigid body that falls and can be pushed
    spawn: object({ position: vector }), // where players appear
    prop, // static: a convex hull of the model
  },
  {
    // A generator expands a seed into ordinary objects with game code, so scenes stay small.
    boxes: {
      settings: object({
        count: { ...integer, min: 0, max: 50 },
        spread: { ...number, min: 1, max: 10 },
      }),
      generate(settings, random) {
        // `random` is the engine's seeded stream: the same seed always produces the same stack.
        const scatter = () => (random.range(-100, 100) / 100) * settings.spread;
        return Array.from({ length: settings.count }, (_, i) => ({
          id: String(i), // the engine prefixes the generator's id, giving stack/0, stack/1…
          type: 'box',
          settings: {
            position: { x: scatter(), y: 3 + i * 0.7, z: scatter() },
            size: { x: 0.7, y: 0.7, z: 0.7 },
            color: '#f2ad55',
          },
        }));
      },
    },
  },
  // Scene-wide settings, validated the same way as object settings.
  object({
    gravity: object({ x: acceleration, y: acceleration, z: acceleration }),
    background: string,
  }),
);

// Both files are validated when this module loads, so a broken scene fails at startup.
export const scenes = {
  workshop: registry.parse(workshop),
  courtyard: registry.parse(courtyard),
};
export type WorkshopScene = (typeof scenes)[keyof typeof scenes];
// Every object the registry can expand to, each with settings typed by its schema.
export type WorkshopObject = ReturnType<typeof registry.expand>[number];

export function getScene(id: string): WorkshopScene {
  if (!Object.hasOwn(scenes, id)) throw new Error(`Unknown scene: ${id}`);
  return scenes[id as keyof typeof scenes];
}

// Model files live beside the scenes; the browser fetches them and the server reads them from disk.
export const modelUrl = (name: string): URL => new URL(`./assets/${name}`, import.meta.url);
export const modelNames = new Set(
  Object.values(scenes)
    .flatMap((scene) => registry.expand(scene))
    .flatMap((entry) => (entry.type === 'prop' ? [entry.settings.model] : [])),
);
