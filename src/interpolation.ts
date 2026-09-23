export class SnapshotBuffer<T> {
  private samples: { tick: number; value: T }[] = [];

  constructor(
    readonly capacity = 48,
    readonly extrapolateTicks = 0,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 2)
      throw new Error('Invalid snapshot capacity');
    if (!Number.isFinite(extrapolateTicks) || extrapolateTicks < 0)
      throw new Error('Invalid snapshot extrapolation');
  }

  push(tick: number, value: T): void {
    if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Invalid snapshot tick');
    if (tick <= (this.samples.at(-1)?.tick ?? -1)) return;
    this.samples.push({ tick, value: structuredClone(value) });
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  sample(tick: number): { from: T; to: T; alpha: number } | undefined {
    if (!Number.isFinite(tick)) throw new Error('Invalid presentation tick');
    const last = this.samples.length - 1;
    if (last < 0) return;
    if (last === 0) return { from: this.samples[0]!.value, to: this.samples[0]!.value, alpha: 0 };
    let i = last - 1;
    while (i > 0 && this.samples[i]!.tick > tick) i--;
    const a = this.samples[i]!,
      b = this.samples[i + 1]!;
    const span = b.tick - a.tick;
    const alpha = Math.max(0, Math.min((tick - a.tick) / span, 1 + this.extrapolateTicks / span));
    return { from: a.value, to: b.value, alpha };
  }

  get newestTick(): number {
    return this.samples.at(-1)?.tick ?? -1;
  }
  clear(): void {
    this.samples = [];
  }
}

export class RenderClock {
  tick = -1;

  constructor(
    readonly tps: number,
    readonly delayTicks = 2,
    readonly resyncTicks = 8,
    readonly driftMs = 500,
  ) {
    const finite = Number.isFinite(tps + delayTicks + resyncTicks + driftMs);
    if (!finite || tps <= 0 || delayTicks < 0 || resyncTicks < 0 || driftMs <= 0)
      throw new Error('Invalid render clock configuration');
  }

  advance(elapsedMs: number, newestTick: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid elapsed time');
    const target = newestTick - this.delayTicks;
    if (this.tick < 0 || Math.abs(target - this.tick) > this.resyncTicks)
      return (this.tick = target);
    this.tick += (elapsedMs / 1000) * this.tps;
    this.tick += (target - this.tick) * (1 - Math.exp(-elapsedMs / this.driftMs));
    return this.tick;
  }

  reset(): void {
    this.tick = -1;
  }
}
