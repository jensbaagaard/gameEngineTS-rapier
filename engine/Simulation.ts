import type { GameObject } from "./Gameobject/GameObject";
import { Input } from "./Input";
import type {
  SimMessage,
  Snapshot,
  SnapshotObject,
} from "./interfaces/Protocol";
import type { Scene, SceneObject } from "./interfaces/Scene";
import { PhysicsController } from "./physics/physicsController";

export class Simulation {
  public deltaTime = 0;
  public gameObjects: Record<string, GameObject> = {};
  public inputs: Record<string, Input> = {};

  private physics: PhysicsController;
  private listeners: ((snapshot: Snapshot) => void)[] = [];
  private lastTick = 0;

  constructor(private scene: Scene) {
    this.physics = new PhysicsController(this, scene.gravity);
    for (const entry of scene.gameObjects) this.spawn(entry);
  }

  public start(): void {
    for (const gameObject of Object.values(this.gameObjects))
      gameObject.start();
    this.lastTick = performance.now();
    setInterval(() => this.tick(), 1000 / 60);
  }

  public subscribe(listener: (snapshot: Snapshot) => void): void {
    this.listeners.push(listener);
  }

  public handle(msg: SimMessage): void {
    const { playerId } = msg;
    if (msg.type === "key") this.inputs[playerId]?.key(msg.key, msg.down);
    else if (msg.type === "join") {
      this.inputs[playerId] = new Input();
      this.instantiate(this.scene.player, playerId);
    } else {
      delete this.inputs[playerId];
      for (const gameObject of Object.values(this.gameObjects))
        if (gameObject.owner === playerId) this.destroy(gameObject);
    }
  }

  public instantiate(entry: SceneObject, owner?: string): GameObject {
    const gameObject = this.spawn(entry, owner);
    gameObject.start();
    return gameObject;
  }

  public destroy(gameObject: GameObject): void {
    if (!this.gameObjects[gameObject.id]) return;
    gameObject.onDestroy();
    this.physics.removeGameObject(gameObject);
    delete this.gameObjects[gameObject.id];
  }

  private spawn(entry: SceneObject, owner?: string): GameObject {
    const [type, position] = Array.isArray(entry) ? entry : ([entry] as const);
    const gameObject = new type(this, position, owner);
    this.gameObjects[gameObject.id] = gameObject;
    this.physics.addGameObject(gameObject);
    return gameObject;
  }

  private tick(): void {
    const now = performance.now();
    this.deltaTime = now - this.lastTick;
    this.lastTick = now;
    for (const gameObject of Object.values(this.gameObjects))
      gameObject.update();
    this.physics.step(this.deltaTime);
    for (const input of Object.values(this.inputs)) input.tick();
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private snapshot(): Snapshot {
    const objects: SnapshotObject[] = [];
    for (const { id, tag, owner, rigidbody } of Object.values(this.gameObjects))
      if (rigidbody)
        objects.push({
          id,
          tag,
          owner,
          position: rigidbody.translation(),
          rotation: rigidbody.rotation(),
        });
    return { type: "snapshot", objects };
  }
}
