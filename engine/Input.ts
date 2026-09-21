export class Input {
  private keys = new Set<string>();
  private downs = new Set<string>();
  private ups = new Set<string>();

  public key(key: string, down: boolean): void {
    if (down) this.keys.add(key);
    else this.keys.delete(key);
    (down ? this.downs : this.ups).add(key);
  }

  public tick(): void {
    this.downs.clear();
    this.ups.clear();
  }

  public held(key: string): boolean {
    return this.keys.has(key);
  }

  public pressed(key: string): boolean {
    return this.downs.has(key);
  }

  public released(key: string): boolean {
    return this.ups.has(key);
  }
}
