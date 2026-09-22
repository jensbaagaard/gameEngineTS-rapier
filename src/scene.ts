import { Rng } from './random.js';
import {
  assertJson,
  isPlainObject,
  validate,
  type Infer,
  type ObjectSchema,
  type Properties,
} from './schema.js';

export type SceneObject<T extends string = string, S = Properties> = {
  id: string;
  type: T;
  settings: S;
};
export type Generator = SceneObject & { seed: number };
export type SceneDocument<S = Properties> = {
  version: 1;
  id: string;
  settings: S;
  objects: (SceneObject | Generator)[];
};
export interface GeneratorType<S extends ObjectSchema = ObjectSchema> {
  settings: S;
  generate(settings: Infer<S>, random: Rng): SceneObject[];
}

type ObjectSchemas = Record<string, ObjectSchema>;
type Generators<G extends ObjectSchemas> = { [K in keyof G]: GeneratorType<G[K]> };
type Expanded<O extends ObjectSchemas> = {
  [K in keyof O & string]: SceneObject<K, Infer<O[K]>>;
}[keyof O & string];
type Settings<S> = S extends ObjectSchema ? Infer<S> : Properties;

const documentKeys = ['version', 'id', 'settings', 'objects'];
const objectKeys = ['id', 'type', 'settings', 'seed'];

export class SceneRegistry<
  O extends ObjectSchemas,
  G extends ObjectSchemas = {},
  S extends ObjectSchema | undefined = undefined,
> {
  readonly objects: ReadonlyMap<string, ObjectSchema>;
  readonly generators: ReadonlyMap<string, GeneratorType>;

  constructor(
    objects: O,
    generators?: Generators<G>,
    readonly settings?: S,
  ) {
    this.objects = new Map(Object.entries(objects));
    this.generators = new Map(Object.entries(generators ?? {}));
    for (const name of this.generators.keys()) {
      if (this.objects.has(name)) throw new Error(`Ambiguous type: ${name}`);
    }
  }

  parse(value: unknown): SceneDocument<Settings<S>> {
    const raw: unknown = typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
    assertJson(raw, 'scene');
    if (!isPlainObject(raw) || raw.version !== 1) throw new Error('Invalid scene document');
    if (typeof raw.id !== 'string' || !raw.id) throw new Error('Invalid scene document');
    if (!isPlainObject(raw.settings) || !Array.isArray(raw.objects))
      throw new Error('Invalid scene document');
    for (const key of Object.keys(raw)) {
      if (!documentKeys.includes(key)) throw new Error(`Unknown scene property: ${key}`);
    }
    if (this.settings) validate(this.settings, raw.settings, 'scene.settings');
    const ids = new Set<string>();
    for (const entry of raw.objects) this.check(entry, ids, true);
    return raw as unknown as SceneDocument<Settings<S>>;
  }

  private check(
    value: unknown,
    ids: Set<string>,
    allowGenerators: boolean,
  ): asserts value is SceneObject | Generator {
    if (!isPlainObject(value) || typeof value.id !== 'string' || !value.id)
      throw new Error('Invalid scene object');
    if (typeof value.type !== 'string' || !isPlainObject(value.settings))
      throw new Error('Invalid scene object');
    for (const key of Object.keys(value)) {
      if (!objectKeys.includes(key)) throw new Error(`${value.id}: unknown property ${key}`);
    }
    if (ids.has(value.id)) throw new Error(`Duplicate scene id: ${value.id}`);
    ids.add(value.id);
    const isGenerator = Object.hasOwn(value, 'seed');
    if (isGenerator && (!allowGenerators || !Number.isSafeInteger(value.seed)))
      throw new Error(`${value.id}: invalid generator seed`);
    const schema = isGenerator
      ? this.generators.get(value.type)?.settings
      : this.objects.get(value.type);
    if (!schema) {
      const kind = isGenerator ? 'generator' : 'object';
      throw new Error(`${value.id}: unknown ${kind} type ${value.type}`);
    }
    validate(schema, value.settings, value.id);
  }

  expand(document: SceneDocument): Expanded<O>[] {
    const scene = this.parse(document);
    const ids = new Set<string>();
    const result: SceneObject[] = [];
    for (const entry of scene.objects) {
      for (const object of 'seed' in entry ? this.generate(entry) : [entry]) {
        assertJson(object, entry.id);
        this.check(object, ids, false);
        result.push(structuredClone(object));
      }
    }
    return result as Expanded<O>[];
  }

  private generate(generator: Generator): SceneObject[] {
    const definition = this.generators.get(generator.type)!;
    const children = definition.generate(generator.settings, new Rng(generator.seed));
    const childIds = new Set<string>();
    return children.map((child) => {
      this.check(child, childIds, false);
      return { ...child, id: `${generator.id}/${child.id}` };
    });
  }

  bake(document: SceneDocument, id: string): SceneDocument<Settings<S>> {
    const scene = this.parse(document);
    const index = scene.objects.findIndex((entry) => entry.id === id && 'seed' in entry);
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
