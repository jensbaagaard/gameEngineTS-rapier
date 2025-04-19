import { Bodies, Body } from "matter-js";
import { GameObject } from "../../engine/Gameobject/GameObject";
import Debug from "../../engine/Debug/Debug";

export class Box extends GameObject {
  public tag: string = "box";
  public timeAlive: number = 0;
  public rigidbody: Matter.Body = Bodies.rectangle(
    this.startPosition.x,
    this.startPosition.y,
    10,
    10
  );

  public start(): void {}

  public update(): void {
    this.timeAlive += this.game.deltaTime / 1000;

    if (this.rigidbody.position.y > 10000 || this.timeAlive > 20)
      this.destroy(this);
  }
  public onCollition(targetId: string): void {
    Debug.log(this.getComponentById(targetId))
  }

  public onDestroy(): void {
    console.log(":((");
  }
}
