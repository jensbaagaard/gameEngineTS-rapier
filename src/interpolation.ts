export class SnapshotBuffer<T> {
  private samples: { tick: number; value: T }[] = [];
  constructor(readonly capacity = 48) {
    if (!Number.isSafeInteger(capacity) || capacity < 2) throw new Error('Invalid snapshot capacity');
  }

  push(tick: number, value: T): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Invalid snapshot tick');
    if (tick <= (this.samples.at(-1)?.tick ?? -1)) return;
    this.samples.push({ tick, value: structuredClone(value) });
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  sample(tick: number): { from: T; to: T; alpha: number } | undefined {
    if (!Number.isFinite(tick)) throw new Error('Invalid presentation tick');
    if (!this.samples.length) return;
    let i = this.samples.length - 1;
    while (i > 0 && this.samples[i]!.tick > tick) i--;
    const a = this.samples[i]!, b = this.samples[i + 1] ?? a;
    return { from: a.value, to: b.value, alpha: a === b ? 0 : Math.max(0, Math.min(1, (tick - a.tick) / (b.tick - a.tick))) };
  }

  get newestTick(): number { return this.samples.at(-1)?.tick ?? -1; }
  clear(): void { this.samples = []; }
}
