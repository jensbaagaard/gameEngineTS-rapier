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

export const PLAYER_SIZE: Vector = { x: 0.9, y: 1.5, z: 0.9 };

const positive = { type: 'number', min: 0.01, max: 100, unit: 'm' } as const satisfies Schema;
const size = object({ x: positive, y: positive, z: positive });
const acceleration = { type: 'number', unit: 'm/s²' } as const satisfies Schema;
const block = object({ ...transform, size, color: string });

export const registry = new SceneRegistry(
  {
    ground: block,
    box: block,
    spawn: object({ position: vector }),
  },
  {
    boxes: {
      settings: object({
        count: { ...integer, min: 0, max: 50 },
        spread: { ...number, min: 1, max: 10 },
      }),
      generate(settings, random) {
        const scatter = () => (random.range(-100, 100) / 100) * settings.spread;
        return Array.from({ length: settings.count }, (_, i) => ({
          id: String(i),
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
  object({
    gravity: object({ x: acceleration, y: acceleration, z: acceleration }),
    background: string,
  }),
);

export const scenes = {
  workshop: registry.parse(workshop),
  courtyard: registry.parse(courtyard),
};
export type WorkshopScene = (typeof scenes)[keyof typeof scenes];
export type WorkshopObject = ReturnType<typeof registry.expand>[number];

export function getScene(id: string): WorkshopScene {
  if (!Object.hasOwn(scenes, id)) throw new Error(`Unknown scene: ${id}`);
  return scenes[id as keyof typeof scenes];
}
