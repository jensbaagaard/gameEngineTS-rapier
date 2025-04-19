export class KeyPair<A extends string | number, B extends string | number> {
  public keyA: Record<A, B> = {} as Record<A, B>;
  public keyB: Record<B, A> = {} as Record<B, A>;

  public addStore(a: A, b: B): void {
    this.keyA[a] = b;
    this.keyB[b] = a;
  }

  public removeWithKeyA(a: A): void {
    const b = this.keyA[a];
    delete this.keyA[a];
    if (b !== undefined) {
      delete this.keyB[b];
    }
  }

  public removeWithKeyB(b: B): void {
    const a = this.keyB[b];
    delete this.keyB[b];
    if (a !== undefined) {
      delete this.keyA[a];
    }
  }
}
