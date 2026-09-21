import type {
  ColliderDesc,
  RigidBody,
  RigidBodyDesc,
} from "@dimforge/rapier3d-compat";
import { Input } from "../Input";
import type { Position } from "../interfaces/Scene";
import type { Simulation } from "../Simulation";

let nextId = 0;
const idle = new Input();

export class GameObject {
  public id = String(nextId++);
  public tag: string = "not set";
  public body?: RigidBodyDesc;
  public collider?: ColliderDesc;
  public rigidbody?: RigidBody;

  constructor(
    public game: Simulation,
    public startPosition: Position = { x: 0, y: 0, z: 0 },
    public owner?: string
  ) {}

  public start(): void {}
  public update(): void {}
  public onDestroy(): void {}
  public onCollition(target: GameObject): void {}

  public get input(): Input {
    return (this.owner && this.game.inputs[this.owner]) || idle;
  }

  public getComponentByTag<T extends GameObject>(tag: string): T[] {
    return Object.values(this.game.gameObjects).filter(
      (gameObject) => gameObject.tag === tag
    ) as T[];
  }
}
