import { assertJson, type Json, type Properties } from './schema.js';

export interface Patch {
  revision: number;
  base: number | null;
  set: Properties;
  remove: string[];
}

export function canonical(value: Json): string {
  assertJson(value);
  return encode(value);
}

function encode(item: Json): string {
  if (Array.isArray(item)) return '[' + item.map(encode).join(',') + ']';
  if (item === null || typeof item !== 'object') return JSON.stringify(item);
  const fields = Object.keys(item)
    .sort()
    .map((key) => JSON.stringify(key) + ':' + encode(item[key]!));
  return '{' + fields.join(',') + '}';
}

export class Replicator<S extends Properties = Properties> {
  private previous: Map<string, string> | undefined;
  private revision = 0;

  encode(publicState: S): Patch {
    const next = new Map(
      Object.entries(publicState).map(([key, value]) => [key, canonical(value)]),
    );
    const changed = [...next].filter(([key, encoded]) => this.previous?.get(key) !== encoded);
    const set = Object.fromEntries(
      changed.map(([key]) => [key, structuredClone(publicState[key]!)]),
    );
    const remove = [...(this.previous?.keys() ?? [])].filter((key) => !next.has(key));
    const patch = {
      revision: this.revision + 1,
      base: this.previous ? this.revision : null,
      set,
      remove,
    };
    this.previous = next;
    this.revision++;
    return patch;
  }

  reset(): void {
    this.previous = undefined;
  }
}

export class Replica<S extends Properties = Properties> {
  state = {} as S;
  revision = 0;

  apply(patch: Patch): boolean {
    if (!Number.isSafeInteger(patch.revision) || patch.revision < 1)
      throw new Error('Invalid state revision');
    if (patch.revision <= this.revision) return false;
    if (patch.base !== null && patch.base !== this.revision)
      throw new Error('Missing state baseline; reconnect to synchronize');
    const next: Properties = patch.base === null ? {} : { ...this.state };
    for (const key of patch.remove) delete next[key];
    for (const [key, value] of Object.entries(patch.set)) {
      Object.defineProperty(next, key, {
        value: structuredClone(value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    this.state = next as S;
    this.revision = patch.revision;
    return true;
  }
}

export class Prediction<S, C> {
  private pending: { sequence: number; command: C }[] = [];
  private sequence = 0;
  private acknowledged = 0;

  constructor(
    public state: S,
    private readonly simulate: (state: S, command: C) => void,
    readonly capacity = 120,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new Error('Invalid prediction capacity');
  }

  push(command: C): number {
    if (this.pending.length >= this.capacity)
      throw new Error('Prediction backlog exceeded; reconnect to synchronize');
    const sequence = ++this.sequence;
    this.pending.push({ sequence, command: structuredClone(command) });
    this.simulate(this.state, command);
    return sequence;
  }

  correct(state: S, acknowledged: number): void {
    if (!Number.isSafeInteger(acknowledged)) throw new Error('Invalid command acknowledgement');
    if (acknowledged < this.acknowledged || acknowledged > this.sequence)
      throw new Error('Invalid command acknowledgement');
    this.acknowledged = acknowledged;
    this.pending = this.pending.filter((entry) => entry.sequence > acknowledged);
    this.state = structuredClone(state);
    for (const entry of this.pending) this.simulate(this.state, entry.command);
  }

  reset(state: S): void {
    this.state = structuredClone(state);
    this.pending = [];
  }
}
