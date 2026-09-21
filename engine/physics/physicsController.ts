import {
  ActiveEvents,
  EventQueue,
  init,
  World,
} from "@dimforge/rapier2d-compat";
import type { GameObject } from "../Gameobject/GameObject";
import type { GameController } from "../gameController";
import type { EngineOptions } from "./EngineOptions";

await init();

export class PhysicsController {
  public world: World;
  private events = new EventQueue(true);
  private accumulator = 0;

  constructor(
    private game: GameController,
    options: EngineOptions
  ) {
    this.world = new World(options.gravity);
    this.world.lengthUnit = options.lengthUnit;
    Object.values(game.gameObjects).forEach((obj) => this.addGameObject(obj));
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
    if (!obj.body || !obj.collider) return;
    const body = obj.body
      .setTranslation(obj.startPosition.x, obj.startPosition.y)
      .setUserData(obj.id);
    obj.rigidbody = this.world.createRigidBody(body);
    this.world.createCollider(
      obj.collider.setActiveEvents(ActiveEvents.COLLISION_EVENTS),
      obj.rigidbody
    );
  }

  public removeGameObject(obj: GameObject): void {
    if (obj.rigidbody) this.world.removeRigidBody(obj.rigidbody);
  }

  private onCollision = (a: number, b: number, started: boolean) => {
    const objA = this.gameObjectOf(a);
    const objB = this.gameObjectOf(b);
    if (!started || !objA || !objB) return;
    objA.onCollition(objB);
    this.game.gameObjects[objB.id]?.onCollition(objA);
  };

  private gameObjectOf(handle: number): GameObject | undefined {
    return this.game.gameObjects[
      this.world.getCollider(handle)?.parent()?.userData as string
    ];
  }
}
