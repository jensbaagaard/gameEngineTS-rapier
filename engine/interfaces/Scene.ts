import type { GameObject } from "../Gameobject/GameObject";

export interface Position {
  x: number;
  y: number;
}

export type PositionedGameobject = [typeof GameObject, Position];

export interface Scene {
  gameObjects: (typeof GameObject | PositionedGameobject)[];
}
