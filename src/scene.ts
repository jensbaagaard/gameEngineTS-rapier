import { Rng } from './random.js';
import { assertJson, validate, type Properties, type Schema } from './schema.js';

export type Sharing = 'local' | 'replicated' | 'server';
export interface SceneObject {
  id: string;
  type: string;
  settings: Properties;
}
export interface Generator extends SceneObject { seed: number }
export interface SceneDocument {
  version: 1;
  id: string;
  settings: Properties;
  objects: (SceneObject | Generator)[];
}
export interface ObjectType { settings: Schema; sharing: Sharing }
export interface GeneratorType {
  settings: Schema;
  generate(settings: Properties, random: Rng): SceneObject[];
}

function properties(value: unknown): value is Properties {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export class SceneRegistry {
  readonly objects: ReadonlyMap<string, ObjectType>;
  readonly generators: ReadonlyMap<string, GeneratorType>;

  constructor(objects: Record<string, ObjectType>, generators: Record<string, GeneratorType> = {}, readonly settings?: Schema) {
    this.objects = new Map(Object.entries(objects));
    this.generators = new Map(Object.entries(generators));
    for (const name of this.generators.keys()) if (this.objects.has(name)) throw new Error(`Ambiguous type: ${name}`);
  }

  parse(value: unknown): SceneDocument {
    const raw: unknown = typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
    assertJson(raw, 'scene');
    if (!properties(raw) || raw.version !== 1 || typeof raw.id !== 'string' || !raw.id || !properties(raw.settings) || !Array.isArray(raw.objects)) throw new Error('Invalid scene document');
    for (const key of Object.keys(raw)) if (!['version', 'id', 'settings', 'objects'].includes(key)) throw new Error(`Unknown scene property: ${key}`);
    if (this.settings) validate(this.settings, raw.settings, 'scene.settings');
    const ids = new Set<string>();
    for (const entry of raw.objects) this.check(entry, ids, true);
    return raw as unknown as SceneDocument;
  }

  private check(value: unknown, ids: Set<string>, generators: boolean): asserts value is SceneObject | Generator {
    if (!properties(value) || typeof value.id !== 'string' || !value.id || typeof value.type !== 'string' || !properties(value.settings)) throw new Error('Invalid scene object');
    for (const key of Object.keys(value)) if (!['id', 'type', 'settings', 'seed'].includes(key)) throw new Error(`${value.id}: unknown property ${key}`);
    if (ids.has(value.id)) throw new Error(`Duplicate scene id: ${value.id}`);
    ids.add(value.id);
    const generated = Object.hasOwn(value, 'seed');
    if (generated && (!generators || !Number.isSafeInteger(value.seed))) throw new Error(`${value.id}: invalid generator seed`);
    const definition = (generated ? this.generators : this.objects).get(value.type);
    if (!definition) throw new Error(`${value.id}: unknown ${generated ? 'generator' : 'object'} type ${value.type}`);
    validate(definition.settings, value.settings, value.id);
  }

  expand(document: SceneDocument): SceneObject[] {
    const scene = this.parse(document);
    const ids = new Set<string>();
    const result: SceneObject[] = [];
    for (const entry of scene.objects) {
      const childIds = new Set<string>();
      const entries = 'seed' in entry
        ? this.generators.get(entry.type)!.generate(entry.settings, new Rng(entry.seed)).map(child => {
          this.check(child, childIds, false);
          return { ...child, id: `${entry.id}/${child.id}` };
        })
        : [entry];
      for (const child of entries) {
        assertJson(child, entry.id);
        this.check(child, ids, false);
        result.push(structuredClone(child));
      }
    }
    return result;
  }

  bake(document: SceneDocument, id: string): SceneDocument {
    const scene = this.parse(document);
    const index = scene.objects.findIndex(entry => entry.id === id && 'seed' in entry);
    if (index < 0) throw new Error(`Unknown generator: ${id}`);
    const objects = this.expand({ ...scene, objects: [scene.objects[index]!] });
    scene.objects.splice(index, 1, ...objects);
    this.expand(scene);
    return scene;
  }

  serialize(document: SceneDocument): string {
    const scene = this.parse(document);
    this.expand(scene);
    return JSON.stringify(scene, null, 2) + '\n';
  }
}
