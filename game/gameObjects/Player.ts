import { Bodies, Body } from "matter-js";
import { GameObject } from "../../engine/Gameobject/GameObject";
import Debug from "../../engine/Debug/Debug";

export class Player extends GameObject {
  public timeAlive: number = 0;
  public jumpCooldown: number = 1000;
  public currentJumpCooldown: number = 0;

  public rigidbody: Matter.Body = Bodies.rectangle(
    this.startPosition.x,
    this.startPosition.y,
    100,
    100,
    { inertia: Infinity, friction: 0, frictionAir: 0.1, mass: 10 }
  );

  public update(): void {
    this.movePlayer();
    if (this.rigidbody.position.y > 10000) this.destroy(this);
  }

  public onCollition(targetId: string): void {
    const gameObject = this.game.gameObjects[targetId]!;

    if (gameObject.tag === "box") this.destroy(gameObject);
  }

  private movePlayer() {
    if (this.currentJumpCooldown > 0)
      this.currentJumpCooldown -= this.game.deltaTime;

    if (this.getInput(["w"]) && this.currentJumpCooldown <= 0) {
      Debug.log("jump");
      this.rigidbody.force = { x: 0, y: -0.3 };
      this.currentJumpCooldown = this.jumpCooldown;
    }

    if (this.getInput(["a"])) {
      this.rigidbody.force = { x: -0.01, y: 0 };
    }

    if (this.getInput(["s"]) && this.currentJumpCooldown <= 0) {
      this.rigidbody.force = { x: 0, y: 0.1 };
      this.currentJumpCooldown = this.jumpCooldown;
    }

    if (this.getInput(["d"])) {
      this.rigidbody.force = { x: 0.01, y: 0 };
    }
  }
}
