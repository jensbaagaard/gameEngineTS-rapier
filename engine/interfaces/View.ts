import type { Object3D } from "three";
import type { Renderer } from "../render/Renderer";
import type { SnapshotObject } from "./Protocol";

export interface View {
  visuals: Record<string, () => Object3D>;
  setup?(renderer: Renderer): void;
  update?(
    renderer: Renderer,
    objects: SnapshotObject[],
    playerId?: string
  ): void;
}
