import type { Object3D, Material, Texture, BufferGeometry } from 'three';
import { WebGPURenderer } from 'three/webgpu';

interface GpuProbe {
  requestAdapter(): Promise<{ requestDevice(): Promise<{ destroy(): void }> } | null>;
}

async function hasWebGpuDevice(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: GpuProbe }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return false;
    const device = await adapter.requestDevice();
    device.destroy();
    return true;
  } catch {
    return false;
  }
}

function assertWebGl2(): void {
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe)
    throw new Error(
      '3D graphics are unavailable. Enable graphics acceleration or try another browser.',
    );
  probe.getExtension('WEBGL_lose_context')?.loseContext();
}

export async function createRenderer(
  canvas: HTMLCanvasElement,
  forceWebGL = false,
): Promise<WebGPURenderer> {
  const webgpu = !forceWebGL && (await hasWebGpuDevice());
  if (!webgpu) assertWebGl2();
  const renderer = new WebGPURenderer({ canvas, antialias: true, forceWebGL: !webgpu });
  try {
    await renderer.init();
    return renderer;
  } catch (error) {
    renderer.dispose();
    throw error;
  }
}

const textInputs = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

export class Keyboard {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly listeners = new AbortController();

  constructor(private readonly target: Window = window) {
    const options = { signal: this.listeners.signal };
    target.addEventListener('keydown', (event) => this.key(event, true), options);
    target.addEventListener('keyup', (event) => this.key(event, false), options);
    target.addEventListener('blur', () => this.clear(), options);
    target.document.addEventListener(
      'visibilitychange',
      () => {
        if (target.document.hidden) this.clear();
      },
      options,
    );
  }

  private key(event: KeyboardEvent, down: boolean): void {
    if (!down) {
      this.held.delete(event.code);
      return;
    }
    const node = event.target as HTMLElement | null;
    if (node?.closest?.(textInputs)) return;
    if (!event.repeat) this.pressed.add(event.code);
    this.held.add(event.code);
  }

  down(code: string): boolean {
    return this.held.has(code);
  }

  consume(code: string): boolean {
    return this.pressed.delete(code);
  }

  clear(): void {
    this.held.clear();
    this.pressed.clear();
  }

  dispose(): void {
    this.listeners.abort();
    this.clear();
  }
}

interface Renderable extends Object3D {
  geometry?: BufferGeometry;
  material?: Material | Material[];
}

function resourcesOf(root: Object3D): Set<{ dispose(): void }> {
  const resources = new Set<{ dispose(): void }>();
  root.traverse((node) => {
    const { geometry, material } = node as Renderable;
    if (geometry) resources.add(geometry);
    for (const entry of material ? [material].flat() : []) {
      resources.add(entry);
      for (const value of Object.values(entry)) {
        if ((value as Texture | null)?.isTexture) resources.add(value as Texture);
      }
    }
  });
  return resources;
}

export class RenderObjects {
  readonly objects = new Map<string, Object3D>();
  constructor(
    readonly root: Object3D,
    private readonly shared: ReadonlySet<{ dispose(): void }> = new Set(),
  ) {}

  add(id: string, object: Object3D): void {
    if (this.objects.has(id) || [...this.objects.values()].includes(object))
      throw new Error(`Duplicate visual id or object: ${id}`);
    this.objects.set(id, object);
    this.root.add(object);
  }

  remove(id: string): void {
    const object = this.objects.get(id);
    if (!object) return;
    this.objects.delete(id);
    object.removeFromParent();
    const kept = this.allResources();
    for (const resource of resourcesOf(object)) {
      if (!kept.has(resource) && !this.shared.has(resource)) resource.dispose();
    }
  }

  dispose(): void {
    const resources = this.allResources();
    for (const object of this.objects.values()) object.removeFromParent();
    this.objects.clear();
    for (const resource of resources) if (!this.shared.has(resource)) resource.dispose();
  }

  private allResources(): Set<{ dispose(): void }> {
    return new Set([...this.objects.values()].flatMap((object) => [...resourcesOf(object)]));
  }
}
