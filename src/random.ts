export class Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(seed: number) {
    this.seed(seed);
  }

  seed(seed: number): void {
    if (!Number.isSafeInteger(seed)) throw new Error('Seed must be a safe integer');
    let x = seed >>> 0;
    const next = (): number => {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  nextU32(): number {
    const s0 = this.s0, s1 = this.s1, s2 = this.s2, s3 = this.s3;
    const r5 = Math.imul(s1, 5) >>> 0;
    const result = (Math.imul(((r5 << 7) | (r5 >>> 25)) >>> 0, 9)) >>> 0;
    const t = (s1 << 9) >>> 0;
    let n2 = (s2 ^ s0) >>> 0;
    let n3 = (s3 ^ s1) >>> 0;
    const n1 = (s1 ^ n2) >>> 0;
    const n0 = (s0 ^ n3) >>> 0;
    n2 = (n2 ^ t) >>> 0;
    n3 = ((n3 << 11) | (n3 >>> 21)) >>> 0;
    this.s0 = n0;
    this.s1 = n1;
    this.s2 = n2;
    this.s3 = n3;
    return result;
  }

  nextInt(n: number): number {
    if (!Number.isSafeInteger(n) || n < 1 || n > 0x100000000) throw new Error('Invalid random range');
    return this.nextU32() % n;
  }

  range(lo: number, hi: number): number {
    return lo + this.nextInt(hi - lo + 1);
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const t = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = t;
    }
    return arr;
  }

  state(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  setState(s: [number, number, number, number]): void {
    if (s.length !== 4 || s.some(n => !Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) || s.every(n => n === 0)) throw new Error('Invalid random state');
    [this.s0, this.s1, this.s2, this.s3] = s;
  }
}
