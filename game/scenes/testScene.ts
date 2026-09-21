import type { Scene } from "../../engine/interfaces/Scene";
import { Box } from "../gameObjects/Box";
import { BoxSpawner } from "../gameObjects/BoxSpawner";
import { CollitionCounter } from "../gameObjects/collitionCounter";
import { Ground } from "../gameObjects/Ground";
import { Player } from "../gameObjects/Player";

export const testScene: Scene = {
  gameObjects: [
    BoxSpawner,
    [Box, { x: 0.3, y: 4, z: 0 }],
    [Ground, { x: 0, y: -0.25, z: 0 }],
    CollitionCounter,
  ],
  player: [Player, { x: 0, y: 2, z: 0 }],
};
