import {
  SceneRegistry,
  integer,
  meters,
  number,
  object,
  string,
  type SceneDocument,
  type Schema,
} from '../src/index.js';
import workshop from './workshop.json';
import courtyard from './courtyard.json';

export const vector = object({ x: meters, y: meters, z: meters });
const positive: Schema = { type: 'number', min: 0.01, max: 100, unit: 'm' };
const size = object({ x: positive, y: positive, z: positive });
const acceleration: Schema = { type: 'number', unit: 'm/s²' };

export const registry = new SceneRegistry(
  {
    ground: { sharing: 'local', settings: object({ position: vector, size, color: string }) },
    box: { sharing: 'replicated', settings: object({ position: vector, size, color: string }) },
    spawn: { sharing: 'local', settings: object({ position: vector }) },
  },
  {
    boxes: {
      settings: object({
        count: { ...integer, min: 0, max: 50 },
        spread: { ...number, min: 1, max: 10 },
      }),
      generate(settings, random) {
        return Array.from({ length: settings.count as number }, (_, i) => ({
          id: String(i),
          type: 'box',
          settings: {
            position: {
              x: (random.range(-100, 100) / 100) * (settings.spread as number),
              y: 3 + i * 0.7,
              z: (random.range(-100, 100) / 100) * (settings.spread as number),
            },
            size: { x: 0.7, y: 0.7, z: 0.7 },
            color: '#f2ad55',
          },
        }));
      },
    },
  },
  object({
    gravity: object({ x: acceleration, y: acceleration, z: acceleration }),
    background: string,
  }),
);

export const scenes = {
  workshop: registry.parse(workshop),
  courtyard: registry.parse(courtyard),
} satisfies Record<string, SceneDocument>;

export function getScene(id: string): SceneDocument {
  if (!Object.hasOwn(scenes, id)) throw new Error(`Unknown scene: ${id}`);
  return scenes[id as keyof typeof scenes];
}

export interface Vector {
  x: number;
  y: number;
  z: number;
}
