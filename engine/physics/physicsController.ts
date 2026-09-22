import {
  ActiveEvents,
  EventQueue,
  init,
  World,
} from "@dimforge/rapier3d-compat";
import type { GameObject } from "../Gameobject/GameObject";
import type { Position } from "../interfaces/Scene";

await init();

export class PhysicsController {
  private world: World;
  private events = new EventQueue(true);
  private owners = new Map<number, GameObject>();
  private accumulator = 0;

  constructor(gravity: Position = { x: 0, y: -9.81, z: 0 }) {
    this.world = new World(gravity);
  }

  public step(deltaMs: number): void {
    const stepMs = this.world.timestep * 1000;
    this.accumulator = Math.min(this.accumulator + deltaMs, 100);
    while (this.accumulator >= stepMs) {
      this.world.step(this.events);
      this.events.drainCollisionEvents(this.onCollision);
      this.accumulator -= stepMs;
    }
  }

  public addGameObject(obj: GameObject): void {
    const { x, y, z } = obj.startPosition;
    if (obj.body)
      obj.rigidbody = this.world.createRigidBody(
        obj.body.setTranslation(x, y, z)
      );
    if (!obj.collider) return;
    if (!obj.rigidbody) obj.collider.setTranslation(x, y, z);
    obj.hitbox = this.world.createCollider(
      obj.collider.setActiveEvents(ActiveEvents.COLLISION_EVENTS),
      obj.rigidbody
    );
    this.owners.set(obj.hitbox.handle, obj);
  }

  public removeGameObject(obj: GameObject): void {
    if (obj.hitbox) {
      this.owners.delete(obj.hitbox.handle);
      this.world.removeCollider(obj.hitbox, false);
    }
    if (obj.rigidbody) this.world.removeRigidBody(obj.rigidbody);
  }

  private onCollision = (a: number, b: number, started: boolean) => {
    const objA = this.owners.get(a);
    const objB = this.owners.get(b);
    if (!started || !objA || !objB) return;
    objA.onCollition(objB);
    this.owners.get(b)?.onCollition(objA);
  };
}
