import type { Object3D, Material, Texture, BufferGeometry } from 'three';
import { WebGPURenderer } from 'three/webgpu';

export async function createRenderer(canvas: HTMLCanvasElement, forceWebGL = false): Promise<WebGPURenderer> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ requestDevice(): Promise<{ destroy(): void }> } | null> } }).gpu;
  let webgpu = false;
  if (!forceWebGL && gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) { const device = await adapter.requestDevice(); device.destroy(); webgpu = true; }
    } catch {}
  }
  if (!webgpu) {
    const probe = document.createElement('canvas').getContext('webgl2');
    if (!probe) throw new Error('3D graphics are unavailable. Enable graphics acceleration or try another browser.');
    probe.getExtension('WEBGL_lose_context')?.loseContext();
  }
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: !webgpu });
  try { await renderer.init(); return renderer; }
  catch (error) { renderer.dispose(); throw error; }
}

export class Keyboard {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly listeners = new AbortController();

  constructor(private readonly target: Window = window) {
    const options = { signal: this.listeners.signal };
    target.addEventListener('keydown', event => this.key(event, true), options);
    target.addEventListener('keyup', event => this.key(event, false), options);
    target.addEventListener('blur', () => this.clear(), options);
    target.document.addEventListener('visibilitychange', () => { if (target.document.hidden) this.clear(); }, options);
  }

  private key(event: KeyboardEvent, down: boolean): void {
    if (!down) { this.held.delete(event.code); return; }
    const node = event.target as HTMLElement | null;
    if (node?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if (!event.repeat) this.pressed.add(event.code);
    this.held.add(event.code);
  }

  down(code: string): boolean { return this.held.has(code); }
  consume(code: string): boolean { return this.pressed.delete(code); }
  clear(): void { this.held.clear(); this.pressed.clear(); }
  dispose(): void { this.listeners.abort(); this.clear(); }
}

export class PointerInput {
  private readonly listeners = new AbortController();
  private x = 0;
  private y = 0;
  private buttons = 0;
  private pressed = 0;
  private disposed = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    const options = { signal: this.listeners.signal };
    const window = canvas.ownerDocument.defaultView!;
    canvas.addEventListener('mousedown', event => { this.buttons |= 1 << event.button; this.pressed |= 1 << event.button; }, options);
    window.addEventListener('mouseup', event => { this.buttons &= ~(1 << event.button); }, options);
    window.addEventListener('mousemove', event => { if (this.locked || event.target === canvas) { this.x += event.movementX; this.y += event.movementY; } }, options);
    window.addEventListener('blur', () => this.clear(), options);
    canvas.ownerDocument.addEventListener('pointerlockchange', () => { if (!this.locked) this.clear(); }, options);
  }

  get locked(): boolean { return this.canvas.ownerDocument.pointerLockElement === this.canvas; }
  async requestLock(): Promise<void> {
    if (this.disposed) throw new Error('Pointer input is disposed');
    await this.canvas.requestPointerLock();
    if (this.disposed && this.locked) this.releaseLock();
  }
  releaseLock(): void { if (this.locked) this.canvas.ownerDocument.exitPointerLock(); this.clear(); }
  consume(): { x: number; y: number; buttons: number; pressed: number } {
    const result = { x: this.x, y: this.y, buttons: this.buttons, pressed: this.pressed };
    this.x = 0; this.y = 0; this.pressed = 0;
    return result;
  }
  private clear(): void { this.x = 0; this.y = 0; this.buttons = 0; this.pressed = 0; }
  dispose(): void { this.disposed = true; this.releaseLock(); this.listeners.abort(); }
}

function resourcesOf(root: Object3D): Set<{ dispose(): void }> {
  const resources = new Set<{ dispose(): void }>();
  root.traverse(node => {
    const renderable = node as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (renderable.geometry) resources.add(renderable.geometry);
    for (const material of renderable.material ? (Array.isArray(renderable.material) ? renderable.material : [renderable.material]) : []) {
      resources.add(material);
      for (const value of Object.values(material)) if ((value as Texture | null)?.isTexture) resources.add(value as Texture);
    }
  });
  return resources;
}

export function disposeObject(root: Object3D): void {
  root.removeFromParent();
  for (const resource of resourcesOf(root)) resource.dispose();
}

export class RenderObjects {
  readonly objects = new Map<string, Object3D>();
  constructor(readonly root: Object3D) {}

  add(id: string, object: Object3D): void {
    if (this.objects.has(id) || [...this.objects.values()].includes(object)) throw new Error(`Duplicate visual id or object: ${id}`);
    this.objects.set(id, object);
    this.root.add(object);
  }

  remove(id: string): void {
    const object = this.objects.get(id);
    if (!object) return;
    this.objects.delete(id);
    object.removeFromParent();
    const shared = new Set([...this.objects.values()].flatMap(other => [...resourcesOf(other)]));
    for (const resource of resourcesOf(object)) if (!shared.has(resource)) resource.dispose();
  }

  dispose(): void {
    const resources = new Set([...this.objects.values()].flatMap(object => [...resourcesOf(object)]));
    for (const object of this.objects.values()) object.removeFromParent();
    this.objects.clear();
    for (const resource of resources) resource.dispose();
  }
}
