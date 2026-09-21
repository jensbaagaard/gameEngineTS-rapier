import {
  ColliderDesc,
  RigidBodyDesc,
  type RigidBody,
} from "@dimforge/rapier3d-compat";
import { GameObject } from "../../engine/Gameobject/GameObject";
import type { CollitionCounter } from "./collitionCounter";

export class Box extends GameObject {
  public tag: string = "box";
  public timeAlive: number = 0;
  public collitionCounter: CollitionCounter | undefined;
  public body = RigidBodyDesc.dynamic();
  public collider = ColliderDesc.cuboid(0.1, 0.1, 0.1).setMass(1);
  declare public rigidbody: RigidBody;

  public start(): void {
    this.collitionCounter =
      this.getComponentByTag<CollitionCounter>("counter")[0];
  }

  public update(): void {
    this.timeAlive += this.game.deltaTime / 1000;
    if (this.rigidbody.translation().y < -100 || this.timeAlive > 20)
      this.game.destroy(this);
  }

  public onCollition(): void {
    this.collitionCounter?.count();
  }

  public onDestroy(): void {
    console.log(":((");
  }
}
