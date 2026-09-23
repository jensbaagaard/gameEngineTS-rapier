// The browser side: Three.js meshes built from the same expanded scene the simulation uses.
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
import type { Models } from '../src/assets.js';
import { RenderObjects } from '../src/browser.js';
import { toQuaternion, type Vector } from '../src/index.js';
import type { Pose, PublicState } from './protocol.js';
import { PLAYER_SIZE, getScene, registry } from './scene.js';

const PLAYER_COLORS = { self: '#3478ba', other: '#aa496c' };
// Reused every frame so drawing does not allocate.
const scratchQuaternion = new Quaternion();
const scratchPosition = new Vector3();

export class DemoView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 100);
  // RenderObjects keeps meshes by id and frees their GPU resources when they are removed,
  // except model geometry, which Models owns and shares across scenes.
  readonly visuals: RenderObjects;
  private readonly listeners = new AbortController();
  private sceneId = '';

  constructor(
    readonly renderer: WebGPURenderer,
    private readonly models: Models,
  ) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(6, 12, 8);
    this.scene.add(light, new AmbientLight(0xffffff, 2));
    const root = new Group();
    this.scene.add(root);
    this.visuals = new RenderObjects(root, models.geometries);
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

  // Rebuilds the scene from the same expand() the simulation uses, so meshes match colliders.
  load(id: string): void {
    const document = getScene(id);
    this.visuals.dispose();
    this.sceneId = id;
    this.scene.background = new Color(document.settings.background);
    for (const entry of registry.expand(document)) {
      if (entry.type === 'spawn') continue;
      const mesh =
        entry.type === 'prop'
          ? this.prop(entry.settings.model, entry.settings.scale)
          : this.mesh(entry.settings.size, entry.settings.color);
      const { position, rotation } = entry.settings;
      mesh.position.copy(position);
      if (rotation) mesh.quaternion.copy(toQuaternion(rotation));
      this.visuals.add(entry.id, mesh);
    }
  }

  private mesh(size: Vector, color: string): Mesh {
    const geometry = new BoxGeometry(size.x, size.y, size.z);
    return new Mesh(geometry, new MeshStandardMaterial({ color, roughness: 0.8 }));
  }

  // Model colours were baked into the vertices when the file was loaded.
  private prop(model: string, scale: number): Mesh {
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const mesh = new Mesh(this.models.get(model).geometry, material);
    mesh.scale.setScalar(scale);
    return mesh;
  }

  // Draws one frame between two snapshots; alpha is how far we are from `from` towards `to`.
  // The local player is drawn at its predicted position instead of the interpolated one.
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
      const previous = from[id] ?? pose; // something that just appeared has no earlier pose
      mesh.position.copy(previous.position).lerp(scratchPosition.copy(pose.position), alpha);
      mesh.quaternion.copy(previous.rotation).slerp(scratchQuaternion.copy(pose.rotation), alpha);
      if (id === playerId && predicted) mesh.position.copy(predicted);
    }
    this.render();
  }

  // Players leave the public state when they disconnect; scene objects only change via load().
  private removeDepartedPlayers(state: PublicState): void {
    for (const id of this.visuals.objects.keys()) {
      if (id.startsWith('player:') && !Object.hasOwn(state, id)) this.visuals.remove(id);
    }
  }

  // Players are not in the scene file, so their meshes are created the first time they appear.
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
