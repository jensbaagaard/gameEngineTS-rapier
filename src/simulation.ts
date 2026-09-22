export interface Phase<C> {
  name: string;
  run(commands: C): void;
}

export class Simulation<C> {
  private running = false;
  private disposed = false;
  private readonly phases: readonly Phase<C>[];

  constructor(
    phases: readonly Phase<C>[],
    private readonly release: () => void = () => {},
  ) {
    const names = new Set(phases.map((phase) => phase.name));
    if (names.has('') || names.size !== phases.length)
      throw new Error('Phase names must be unique and nonempty');
    this.phases = phases.map((phase) => ({ ...phase }));
  }

  step(commands: C): void {
    if (this.disposed) throw new Error('Simulation is disposed');
    if (this.running) throw new Error('Simulation step is reentrant');
    this.running = true;
    try {
      for (const phase of this.phases) phase.run(commands);
    } finally {
      this.running = false;
    }
  }

  dispose(): void {
    if (this.running) throw new Error('Cannot dispose during a step');
    if (this.disposed) return;
    this.disposed = true;
    this.release();
  }
}

export interface Entity {
  update?(): void;
  dispose?(): void;
}

export class Entities<T extends Entity> {
  private readonly entries = new Map<string, T>();
  private nextId = 0;
  private disposed = false;

  add(entity: T, id = `runtime:${this.nextId++}`): string {
    if (this.disposed) throw new Error('Entities are disposed');
    if (!id || this.entries.has(id)) throw new Error(`Duplicate or empty entity id: ${id}`);
    this.entries.set(id, entity);
    return id;
  }

  get(id: string): T | undefined {
    return this.entries.get(id);
  }

  remove(id: string): void {
    const entity = this.entries.get(id);
    if (!entity) return;
    this.entries.delete(id);
    entity.dispose?.();
  }

  update(): void {
    const snapshot = this.sortedIds().map((id) => [id, this.entries.get(id)!] as const);
    for (const [id, entity] of snapshot) {
      if (this.entries.get(id) === entity) entity.update?.();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    for (const id of this.sortedIds()) {
      try {
        this.remove(id);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Entity disposal failed');
  }

  private sortedIds(): string[] {
    return [...this.entries.keys()].sort();
  }
}
