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
import type { Pose, PublicState } from './protocol.js';
import { PLAYER_SIZE, getScene, registry, type Vector } from './scene.js';

const PLAYER_COLORS = { self: '#3478ba', other: '#aa496c' };
const scratchQuaternion = new Quaternion();
const scratchPosition = new Vector3();

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

  get currentScene(): string {
    return this.sceneId;
  }

  load(id: string): void {
    const document = getScene(id);
    this.visuals.dispose();
    this.sceneId = id;
    this.scene.background = new Color(document.settings.background);
    for (const entry of registry.expand(document)) {
      if (entry.type === 'spawn') continue;
      const { position, size, color } = entry.settings;
      const mesh = this.mesh(size, color);
      mesh.position.copy(position);
      this.visuals.add(entry.id, mesh);
    }
  }

  private mesh(size: Vector, color: string): Mesh {
    const geometry = new BoxGeometry(size.x, size.y, size.z);
    return new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.8 }));
  }

  draw(
    from: PublicState,
    to: PublicState,
    alpha: number,
    playerId?: string,
    predicted?: Vector,
  ): void {
    this.removeDepartedPlayers(to);
    for (const [id, pose] of Object.entries(to)) {
      const mesh = this.visuals.objects.get(id) ?? this.addPlayer(id, pose, playerId);
      if (!mesh) continue;
      const previous = from[id] ?? pose;
      mesh.position.copy(previous.position).lerp(scratchPosition.copy(pose.position), alpha);
      mesh.quaternion.copy(previous.rotation).slerp(scratchQuaternion.copy(pose.rotation), alpha);
      if (id === playerId && predicted) mesh.position.copy(predicted);
    }
    this.render();
  }

  private removeDepartedPlayers(state: PublicState): void {
    for (const id of this.visuals.objects.keys()) {
      if (id.startsWith('player:') && !Object.hasOwn(state, id)) this.visuals.remove(id);
    }
  }

  private addPlayer(id: string, pose: Pose, playerId?: string): Mesh | undefined {
    if (pose.type !== 'player') return;
    const color = id === playerId ? PLAYER_COLORS.self : PLAYER_COLORS.other;
    const mesh = this.mesh(PLAYER_SIZE, color);
    this.visuals.add(id, mesh);
    return mesh;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.listeners.abort();
    this.visuals.dispose();
    this.renderer.dispose();
  }
}
