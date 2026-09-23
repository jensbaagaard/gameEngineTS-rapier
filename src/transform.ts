import { degrees, meters, object, type Infer } from './schema.js';

export const vector = object({ x: meters, y: meters, z: meters });
export const rotation = object({ x: degrees, y: degrees, z: degrees });
export const transform = { position: vector, rotation: { ...rotation, optional: true } } as const;
export type Vector = Infer<typeof vector>;
export type Quaternion = { x: number; y: number; z: number; w: number };

export function toQuaternion({ x, y, z }: Vector): Quaternion {
  const half = Math.PI / 360;
  const [cx, cy, cz] = [Math.cos(x * half), Math.cos(y * half), Math.cos(z * half)];
  const [sx, sy, sz] = [Math.sin(x * half), Math.sin(y * half), Math.sin(z * half)];
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}
