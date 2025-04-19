import { Bodies } from "matter-js";
import { GameObject } from "../../engine/Gameobject/GameObject";

export class Box extends GameObject {
  public tag: string = "box";
  public timeAlive: number = 0;
  public rigidbody: Matter.Body = Bodies.rectangle(
    this.startPosition.x,
    this.startPosition.y,
    50,
    50
  );

  public start(): void {}

  public update(): void {
    this.timeAlive += this.game.deltaTime / 1000;

    if (this.rigidbody.position.y > 10000 || this.timeAlive > 20)
      this.destroy(this);
  }

  public onDestroy(): void {
    console.log(":((");
  }
}
