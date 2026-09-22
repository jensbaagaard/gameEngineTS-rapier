export interface Disposable { dispose(): void }

export class Session<S, L extends Disposable> {
  epoch = 0;
  private disposed = false;
  private current: L;

  constructor(readonly state: S, private readonly create: (scene: string, state: S) => L, scene: string) {
    this.current = create(scene, state);
  }

  get level(): L { return this.current; }

  change(scene: string): L {
    if (this.disposed) throw new Error('Session is disposed');
    const next = this.create(scene, this.state);
    const previous = this.current;
    this.current = next;
    this.epoch++;
    previous.dispose();
    return next;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.current.dispose();
  }
}
