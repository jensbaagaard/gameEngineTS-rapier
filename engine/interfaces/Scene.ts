import type { GameObject } from "../Gameobject/GameObject";

export interface Position {
  x: number;
  y: number;
  z: number;
}

export type SceneObject = typeof GameObject | [typeof GameObject, Position];

export interface Scene {
  gameObjects: SceneObject[];
  player: SceneObject;
  gravity?: Position;
}
