import { GameObject } from "../../engine/Gameobject/GameObject";
import { Box } from "./Box";

export class BoxSpawner extends GameObject {
  public start(): void {}

  public update(): void {
    if (this.getKeyDown(["f"])) {
      for (let index = 0; index < 10; index++) {
        this.game.instantiateGameObject(Box, { x: Math.random() * 800, y: 0 });
        
      }
    }
  }
}
