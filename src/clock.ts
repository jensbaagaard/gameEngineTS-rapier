export class FixedClock {
  private remainder = 0;

  constructor(readonly stepMs: number, readonly maxSteps = 8) {
    if (!Number.isFinite(stepMs) || stepMs <= 0 || !Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new Error('Invalid clock configuration');
  }

  advance(elapsedMs: number, step: () => void): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Invalid elapsed time');
    this.remainder += Math.min(elapsedMs, this.stepMs * this.maxSteps);
    let count = 0;
    while (this.remainder + 1e-9 >= this.stepMs && count < this.maxSteps) {
      this.remainder = Math.max(0, this.remainder - this.stepMs);
      step();
      count++;
    }
    return this.alpha;
  }

  get alpha(): number { return this.remainder / this.stepMs; }
  reset(): void { this.remainder = 0; }
}

export function scheduleTicks(tps: number, step: () => void): () => void {
  const clock = new FixedClock(1000 / tps, 4);
  let last = performance.now();
  let active = true;
  let timer: ReturnType<typeof setTimeout>;
  const loop = () => {
    const now = performance.now();
    const elapsed = now - last;
    last = now;
    clock.advance(elapsed, () => { if (active) step(); });
    if (active) timer = setTimeout(loop, Math.max(1, clock.stepMs * (1 - clock.alpha) - (performance.now() - now)));
  };
  timer = setTimeout(loop, clock.stepMs);
  return () => { active = false; clearTimeout(timer); };
}
