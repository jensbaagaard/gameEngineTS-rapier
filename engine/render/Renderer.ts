import { PerspectiveCamera, Scene, WebGLRenderer, type Object3D } from "three";
import type { SnapshotObject } from "../interfaces/Protocol";
import type { View } from "../interfaces/View";

export class Renderer {
  public scene = new Scene();
  public camera = new PerspectiveCamera(60);
  public meshes = new Map<string, Object3D>();
  private renderer = new WebGLRenderer({ antialias: true });

  constructor(
    html: HTMLElement,
    private view: View
  ) {
    this.renderer.setPixelRatio(devicePixelRatio);
    html.appendChild(this.renderer.domElement);
    this.resize();
    addEventListener("resize", () => this.resize());
    view.setup?.(this);
  }

  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  public draw(objects: SnapshotObject[], playerId?: string): void {
    const stale = new Set(this.meshes.keys());
    for (const obj of objects) {
      let mesh = this.meshes.get(obj.id);
      if (!mesh) {
        mesh = this.view.visuals[obj.tag]?.();
        if (!mesh) continue;
        this.scene.add(mesh);
        this.meshes.set(obj.id, mesh);
      }
      stale.delete(obj.id);
      mesh.position.copy(obj.position);
      mesh.quaternion.copy(obj.rotation);
    }
    for (const id of stale) {
      this.meshes.get(id)!.removeFromParent();
      this.meshes.delete(id);
    }
    this.view.update?.(this, objects, playerId);
    this.renderer.render(this.scene, this.camera);
  }
}
