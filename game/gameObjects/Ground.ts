import { ColliderDesc, RigidBodyDesc } from "@dimforge/rapier3d-compat";
import { GameObject } from "../../engine/Gameobject/GameObject";

export class Ground extends GameObject {
  public tag: string = "ground";
  public body = RigidBodyDesc.fixed();
  public collider = ColliderDesc.cuboid(10, 0.25, 10);
}
