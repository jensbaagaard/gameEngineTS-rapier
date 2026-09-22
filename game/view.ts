import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { RenderObjects } from '../src/browser.js';
import type { Properties } from '../src/index.js';
import { getScene, registry, type Vector } from './scene.js';

export interface Pose {
  type: string;
  position: Vector;
  rotation: Vector & { w: number };
}
const quaternion = new Quaternion();
const position = new Vector3();

export class DemoView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 100);
  readonly visuals: RenderObjects;
  private readonly listeners = new AbortController();
  private sceneId = '';

  constructor(readonly renderer: WebGPURenderer) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(6, 12, 8);
    this.scene.add(light, new AmbientLight(0xffffff, 2));
    const root = new Group();
    this.scene.add(root);
    this.visuals = new RenderObjects(root);
    this.camera.position.set(17, 19, 23);
    this.camera.lookAt(0, 0, 0);
    window.addEventListener('resize', () => this.resize(), { signal: this.listeners.signal });
    this.resize();
  }

  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  load(id: string): void {
    const document = getScene(id);
    this.visuals.dispose();
    this.sceneId = id;
    this.scene.background = new Color(document.settings.background as string);
    for (const entry of registry.expand(document)) {
      if (entry.type === 'spawn') continue;
      const settings = entry.settings as unknown as {
        position: Vector;
        size: Vector;
        color: string;
      };
      const mesh = this.mesh(settings.size, settings.color);
      mesh.position.copy(settings.position);
      this.visuals.add(entry.id, mesh);
    }
  }

  private mesh(size: Vector, color: string): Mesh {
    return new Mesh(
      new BoxGeometry(size.x, size.y, size.z),
      new MeshStandardMaterial({ color, roughness: 0.8 }),
    );
  }

  draw(
    from: Properties,
    to: Properties,
    alpha: number,
    playerId?: string,
    predicted?: Vector,
  ): void {
    for (const id of this.visuals.objects.keys())
      if (id.startsWith('player:') && !Object.hasOwn(to, id)) this.visuals.remove(id);
    for (const [id, data] of Object.entries(to)) {
      const pose = data as unknown as Pose;
      let mesh = this.visuals.objects.get(id);
      if (!mesh && pose.type === 'player') {
        mesh = this.mesh({ x: 0.9, y: 1.5, z: 0.9 }, id === playerId ? '#3478ba' : '#aa496c');
        this.visuals.add(id, mesh);
      }
      if (!mesh) continue;
      const previous = (from[id] as unknown as Pose | undefined) ?? pose;
      mesh.position.copy(previous.position).lerp(position.copy(pose.position), alpha);
      mesh.quaternion.copy(previous.rotation).slerp(quaternion.copy(pose.rotation), alpha);
      if (id === playerId && predicted) mesh.position.copy(predicted);
    }
    this.render();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
  get currentScene(): string {
    return this.sceneId;
  }
  dispose(): void {
    this.listeners.abort();
    this.visuals.dispose();
    this.renderer.dispose();
  }
}
