import {
  ColliderDesc,
  RigidBodyDesc,
  type RigidBody,
} from "@dimforge/rapier2d-compat";
import { GameObject } from "../../engine/Gameobject/GameObject";
import Debug from "../../engine/Debug/Debug";

export class Player extends GameObject {
  public timeAlive: number = 0;
  public jumpCooldown: number = 1000;
  public currentJumpCooldown: number = 0;
  public body = RigidBodyDesc.dynamic().lockRotations().setLinearDamping(6.7);
  public collider = ColliderDesc.cuboid(50, 50).setFriction(0).setMass(10);
  declare public rigidbody: RigidBody;

  public update(): void {
    this.movePlayer();
    if (this.rigidbody.translation().y > 10000) this.destroy(this);
  }

  public onCollition(target: GameObject): void {
    if (target.tag === "box") this.destroy(target);
  }

  private movePlayer() {
    if (this.currentJumpCooldown > 0)
      this.currentJumpCooldown -= this.game.deltaTime;

    this.rigidbody.resetForces(true);

    if (this.getInput(["w"]) && this.currentJumpCooldown <= 0) {
      Debug.log("jump");
      this.rigidbody.applyImpulse({ x: 0, y: -5000 }, true);
      this.currentJumpCooldown = this.jumpCooldown;
    }

    if (this.getInput(["a"]))
      this.rigidbody.addForce({ x: -10000, y: 0 }, true);

    if (this.getInput(["s"]) && this.currentJumpCooldown <= 0) {
      this.rigidbody.applyImpulse({ x: 0, y: 1667 }, true);
      this.currentJumpCooldown = this.jumpCooldown;
    }

    if (this.getInput(["d"])) this.rigidbody.addForce({ x: 10000, y: 0 }, true);
  }
}
