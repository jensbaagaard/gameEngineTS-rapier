import { expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { RenderObjects } from '../src/browser.js';

it('keeps shared GPU resources until the last visual is removed', () => {
  const geometry = new BoxGeometry(),
    texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture });
  const frees = [geometry, material, texture].map((resource) => vi.spyOn(resource, 'dispose'));
  const objects = new RenderObjects(new Group());
  objects.add('a', new Mesh(geometry, material));
  objects.add('b', new Mesh(geometry, material));
  expect(() => objects.add('duplicate', objects.objects.get('a')!)).toThrow('Duplicate');
  objects.remove('a');
  for (const free of frees) expect(free).not.toHaveBeenCalled();
  objects.dispose();
  objects.dispose();
  for (const free of frees) expect(free).toHaveBeenCalledTimes(1);
  expect(objects.root.children).toHaveLength(0);
});
