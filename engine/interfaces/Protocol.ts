import type { Position } from "./Scene";

export type Rotation = Position & { w: number };

export interface SnapshotObject {
  id: string;
  tag: string;
  owner?: string;
  position: Position;
  rotation: Rotation;
}

export interface Snapshot {
  type: "snapshot";
  objects: SnapshotObject[];
}

export type ClientMessage = { type: "key"; key: string; down: boolean };

export type SimMessage = (
  ClientMessage | { type: "join" } | { type: "leave" }
) & { playerId: string };

export type ServerMessage = Snapshot | { type: "welcome"; playerId: string };
