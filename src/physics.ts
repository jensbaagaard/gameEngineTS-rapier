import RAPIER from '@dimforge/rapier3d-deterministic-compat';

let initialization: Promise<void> | undefined;
export function initPhysics(): Promise<void> {
  return (initialization ??= RAPIER.init().catch((error) => {
    initialization = undefined;
    throw error;
  }));
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private readonly events: RAPIER.EventQueue;
  private readonly owners = new Map<number, PhysicsObject>();
  private readonly objects = new Set<PhysicsObject>();
  private disposed = false;
  private running = false;

  constructor(tps: number, gravity = { x: 0, y: -9.81, z: 0 }) {
    if (!Number.isFinite(tps) || tps <= 0) throw new Error('Invalid physics tick rate');
    this.world = new RAPIER.World(gravity);
    this.world.timestep = 1 / tps;
    this.events = new RAPIER.EventQueue(true);
  }

  step(): void {
    if (this.disposed || this.running)
      throw new Error(this.disposed ? 'Physics world is disposed' : 'Physics step is reentrant');
    this.running = true;
    try {
      this.world.step(this.events);
      this.events.drainCollisionEvents((a, b, started) => {
        const first = this.owners.get(a);
        const second = this.owners.get(b);
        if (!first || !second) return;
        first.onCollision?.(second, started);
        if (this.owners.has(a) && this.owners.has(b)) second.onCollision?.(first, started);
      });
    } finally {
      this.running = false;
    }
  }

  add(
    body?: RAPIER.RigidBodyDesc,
    colliders: RAPIER.ColliderDesc[] = [],
    onCollision?: PhysicsObject['onCollision'],
  ): PhysicsObject {
    if (this.disposed) throw new Error('Physics world is disposed');
    const rigidBody = body ? this.world.createRigidBody(body) : undefined;
    const object: PhysicsObject = { body: rigidBody, colliders: [], onCollision };
    this.objects.add(object);
    try {
      for (const descriptor of colliders) {
        const collider = this.world.createCollider(
          descriptor.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          rigidBody,
        );
        object.colliders.push(collider);
        this.owners.set(collider.handle, object);
      }
      return object;
    } catch (error) {
      this.remove(object);
      throw error;
    }
  }

  remove(object: PhysicsObject): void {
    if (this.disposed || !this.objects.delete(object)) return;
    for (const collider of object.colliders) {
      this.owners.delete(collider.handle);
      if (collider.isValid()) this.world.removeCollider(collider, true);
    }
    if (object.body?.isValid()) this.world.removeRigidBody(object.body);
  }

  snapshot(): Uint8Array {
    if (this.disposed) throw new Error('Physics world is disposed');
    return this.world.takeSnapshot();
  }

  dispose(): void {
    if (this.running) throw new Error('Cannot dispose during a physics step');
    if (this.disposed) return;
    this.disposed = true;
    this.owners.clear();
    this.objects.clear();
    this.events.free();
    this.world.free();
  }
}

export interface PhysicsObject {
  body?: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  onCollision?(other: PhysicsObject, started: boolean): void;
}

export { RAPIER };
