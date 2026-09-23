import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { Models } from '../src/assets.js';
import { modelNames, modelUrl } from '../game/scene.js';

it('loads each model once into one vertex-coloured geometry and frees it on dispose', async () => {
  const read = vi.fn((name: string) => readFile(modelUrl(name)));
  const models = new Models(read);
  expect(() => models.get('pine.glb')).toThrow('not loaded');
  await models.load(modelNames);
  await models.load(modelNames);
  expect(read).toHaveBeenCalledTimes(modelNames.size);
  expect(models.get('Box.glb').positions).toHaveLength(12 * 3 * 3);
  const pine = models.get('pine.glb');
  expect(pine.positions.length % 9).toBe(0);
  expect(pine.geometry.getAttribute('color').itemSize).toBe(3);
  pine.geometry.computeBoundingBox();
  const { min, max } = pine.geometry.boundingBox!;
  expect(max.y - min.y).toBeCloseTo(13.24, 1);
  expect(models.geometries.has(pine.geometry)).toBe(true);
  const free = vi.spyOn(pine.geometry, 'dispose');
  models.dispose();
  expect(free).toHaveBeenCalledOnce();
  expect(() => models.get('pine.glb')).toThrow();
});
