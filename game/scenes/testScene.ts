import type { Scene } from "../../engine/interfaces/Scene";
import { Box } from "../gameObjects/Box";
import { BoxSpawner } from "../gameObjects/BoxSpawner";
import { CollitionCounter } from "../gameObjects/collitionCounter";
import { Ground } from "../gameObjects/Ground";
import { Player } from "../gameObjects/Player";

export const testScene: Scene = {
  gameObjects: [
    BoxSpawner,
    [Box, { x: 50, y: 50 }],
    Ground,
    Player,
    CollitionCounter,
  ],
};
