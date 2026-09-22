import { describe, expect, it } from 'vitest';
import { SceneRegistry, array, integer, object, validate } from '../src/index.js';
import { registry, scenes } from '../game/scene.js';

describe('scene documents', () => {
  it('round trips data and bakes generation without changing ids or settings', () => {
    const scene = scenes.workshop;
    const expanded = registry.expand(scene);
    const saved = registry.serialize(scene);
    expect(registry.expand(registry.parse(saved))).toEqual(expanded);
    const baked = registry.bake(scene, 'stack');
    expect(registry.expand(baked)).toEqual(expanded);
    expect(baked.objects.some(entry => 'seed' in entry)).toBe(false);
    expect(scene.objects.some(entry => 'seed' in entry)).toBe(true);
    expect(registry.serialize(registry.parse(saved))).toBe(saved);
  });
  it('does not depend on type registration order or contaminate other expansions', () => {
    const reversed = new SceneRegistry(Object.fromEntries([...registry.objects].reverse()), Object.fromEntries([...registry.generators].reverse()), registry.settings);
    expect(reversed.expand(scenes.workshop)).toEqual(registry.expand(scenes.workshop));
    const first = registry.expand(scenes.workshop); first[0]!.settings.color = 'changed';
    expect(registry.expand(scenes.workshop)[0]!.settings.color).not.toBe('changed');
  });
  it.each([
    (s: any) => { s.version = 2; },
    (s: any) => { s.objects.push(s.objects[0]); },
    (s: any) => { s.objects[0].type = 'unknown'; },
    (s: any) => { s.objects[0].settings.size.x = -1; },
    (s: any) => { s.objects[0].settings.position.x = NaN; },
    (s: any) => { s.objects[0].settings.extra = 1; },
    (s: any) => { s.objects[2].seed = 0.5; },
  ])('rejects malformed scenes before simulation construction', mutate => {
    const scene = structuredClone(scenes.workshop); mutate(scene);
    expect(() => registry.parse(scene)).toThrow();
  });
  it('rejects generated duplicate ids and collisions with authored ids', () => {
    const scene = structuredClone(scenes.workshop);
    scene.objects.push({ id: 'stack/0', type: 'spawn', settings: { position: { x: 0, y: 0, z: 0 } } });
    expect(() => registry.expand(scene)).toThrow('Duplicate');
  });
  it('validates nested editor settings', () => {
    const schema = object({ points: array(object({ x: integer })) });
    expect(() => validate(schema, { points: [{ x: 2 }] })).not.toThrow();
    expect(() => validate(schema, { points: [{ x: 2.5 }] })).toThrow('points[0].x');
    expect(() => validate(schema, { points: new Array(2) })).toThrow('JSON');
  });
  it('rejects invalid ids from a generator before namespacing them', () => {
    const registry = new SceneRegistry({ box: { settings: object({}), sharing: 'local' } }, {
      boxes: { settings: object({}), generate: () => [{ id: '', type: 'box', settings: {} }] },
    });
    expect(() => registry.expand({ version: 1, id: 'bad', settings: {}, objects: [{ id: 'generator', type: 'boxes', settings: {}, seed: 1 }] })).toThrow('Invalid scene object');
  });
});
