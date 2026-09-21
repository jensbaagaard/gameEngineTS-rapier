export class InputController {
  public pressedKeys: Record<string, boolean> = {};

  private pendingKeyDowns: Record<string, boolean> = {};
  private pendingKeyUps: Record<string, boolean> = {};

  public keysDownThisFrame: Record<string, boolean> = {};
  public keysUpThisFrame: Record<string, boolean> = {};

  constructor() {
    window.addEventListener("keydown", (e) => {
      e.preventDefault();
      if (!this.pendingKeyDowns[e.key]) {
        this.pendingKeyDowns[e.key] = true;
      }
    });

    window.addEventListener("keyup", (e) => {
      e.preventDefault();
      if (!this.pendingKeyUps[e.key]) {
        this.pendingKeyUps[e.key] = true;
      }
    });
  }

  public updateInputState(): void {
    this.keysDownThisFrame = { ...this.pendingKeyDowns };
    for (const key in this.pendingKeyDowns) {
      this.pressedKeys[key] = true;
    }
    this.pendingKeyDowns = {};

    this.keysUpThisFrame = { ...this.pendingKeyUps };
    for (const key in this.pendingKeyUps) {
      if (this.pressedKeys[key]) {
        delete this.pressedKeys[key];
      }
    }
    this.pendingKeyUps = {};
  }
}
