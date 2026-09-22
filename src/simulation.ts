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
    if (new Set(phases.map((p) => p.name)).size !== phases.length || phases.some((p) => !p.name))
      throw new Error('Phase names must be unique and nonempty');
    this.phases = phases.map((phase) => ({ ...phase }));
  }

  step(commands: C): void {
    if (this.disposed || this.running)
      throw new Error(this.disposed ? 'Simulation is disposed' : 'Simulation step is reentrant');
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
  values(): T[] {
    return [...this.entries.keys()].sort().map((id) => this.entries.get(id)!);
  }

  remove(id: string): void {
    const entity = this.entries.get(id);
    if (!entity) return;
    this.entries.delete(id);
    entity.dispose?.();
  }

  update(): void {
    const entries = [...this.entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [id, entity] of entries) if (this.entries.get(id) === entity) entity.update?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const errors: unknown[] = [];
    for (const id of [...this.entries.keys()].sort()) {
      try {
        this.remove(id);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Entity disposal failed');
  }
}
