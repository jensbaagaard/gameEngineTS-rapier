import { Bodies } from "matter-js";
import { GameObject } from "../../engine/Gameobject/GameObject";

export class Ground extends GameObject {
  public tag: string = "ground";
  public rigidbody: Matter.Body = Bodies.rectangle(400, 610, 810, 60, {
    isStatic: true,
  });

  public start(): void {}

  public update(): void {}
}
