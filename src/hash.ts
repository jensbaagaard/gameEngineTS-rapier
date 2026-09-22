export class Hasher {
  private h = 0x811c9dc5;

  int(v: number): this {
    const x = v | 0;
    this.byte(x & 0xff);
    this.byte((x >>> 8) & 0xff);
    this.byte((x >>> 16) & 0xff);
    this.byte((x >>> 24) & 0xff);
    return this;
  }

  bytes(arr: ArrayLike<number>): this {
    for (let i = 0; i < arr.length; i++) this.byte(arr[i]! & 0xff);
    return this;
  }

  private byte(b: number): this {
    this.h ^= b;
    this.h = Math.imul(this.h, 0x01000193) >>> 0;
    return this;
  }

  digest(): number {
    return this.h >>> 0;
  }
}
