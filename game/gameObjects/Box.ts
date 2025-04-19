import { Bodies, Body } from "matter-js";
import { GameObject } from "../../engine/Gameobject/GameObject";
import type { CollitionCounter } from "./collitionCounter";

export class Box extends GameObject {
  public tag: string = "box";
  public timeAlive: number = 0;
  public collitionCounter: CollitionCounter | undefined;
  public rigidbody: Matter.Body = Bodies.rectangle(
    this.startPosition.x,
    this.startPosition.y,
    10,
    10
  );

  public start(): void {
    this.collitionCounter =
      this.getComponentByTag<CollitionCounter>("counter")[0];
  }

  public update(): void {
    this.timeAlive += this.game.deltaTime / 1000;

    if (this.rigidbody.position.y > 10000 || this.timeAlive > 20)
      this.destroy(this);
  }
  public onCollition(): void {
    this.collitionCounter?.count();
  }

  public onDestroy(): void {
    console.log(":((");
  }
}
