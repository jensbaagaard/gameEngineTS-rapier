import {
  ColliderDesc,
  RigidBodyDesc,
  type RigidBody,
} from "@dimforge/rapier3d-compat";
import Debug from "../../engine/Debug/Debug";
import { GameObject } from "../../engine/Gameobject/GameObject";

export class Player extends GameObject {
  public tag: string = "player";
  public jumpCooldown: number = 1000;
  public currentJumpCooldown: number = 0;
  public body = RigidBodyDesc.dynamic().lockRotations().setLinearDamping(2);
  public collider = ColliderDesc.cuboid(0.5, 0.5, 0.5)
    .setFriction(0)
    .setMass(10);
  declare public rigidbody: RigidBody;

  public update(): void {
    this.movePlayer();
    if (this.rigidbody.translation().y < -100) this.game.destroy(this);
  }

  public onCollition(target: GameObject): void {
    if (target.tag === "box") this.game.destroy(target);
  }

  private movePlayer() {
    const x = +this.input.held("d") - +this.input.held("a");
    const z = +this.input.held("s") - +this.input.held("w");
    this.rigidbody.resetForces(true);
    this.rigidbody.addForce({ x: x * 100, y: 0, z: z * 100 }, true);

    if (this.currentJumpCooldown > 0)
      this.currentJumpCooldown -= this.game.deltaTime;
    if (this.input.held(" ") && this.currentJumpCooldown <= 0) {
      Debug.log("jump");
      this.rigidbody.applyImpulse({ x: 0, y: 50, z: 0 }, true);
      this.currentJumpCooldown = this.jumpCooldown;
    }
  }
}
