import { GameObject } from "../../engine/Gameobject/GameObject";
import { Box } from "./Box";

export class BoxSpawner extends GameObject {
  public update(): void {
    if (!Object.values(this.game.inputs).some((input) => input.pressed("f")))
      return;
    for (let i = 0; i < 10; i++)
      this.game.instantiate([
        Box,
        { x: Math.random() * 10 - 5, y: 5, z: Math.random() * 10 - 5 },
      ]);
  }
}
