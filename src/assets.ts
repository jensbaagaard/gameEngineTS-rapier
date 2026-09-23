import {
  Color,
  Float32BufferAttribute,
  Texture,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface Model {
  geometry: BufferGeometry;
  positions: Float32Array;
}

const white = new Color(1, 1, 1);
const untextured = new Texture();
const loader = new GLTFLoader();
loader.register(() => ({ name: 'untextured', loadTexture: () => Promise.resolve(untextured) }));

const parse = (data: ArrayBuffer): Promise<GLTF> =>
  new Promise((resolve, reject) => loader.parse(data, '', resolve, reject));

const colorOf = (material: Material | Material[]): Color =>
  ([material].flat()[0] as { color?: Color }).color ?? white;

function flatten(scene: Object3D): BufferGeometry {
  scene.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  scene.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const { geometry, material, matrixWorld } = node as Mesh;
    const part = (geometry.index ? geometry.toNonIndexed() : geometry.clone()).applyMatrix4(
      matrixWorld,
    );
    const { r, g, b } = colorOf(material);
    const colors = new Float32Array(part.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([r, g, b], i);
    for (const name of Object.keys(part.attributes))
      if (name !== 'position') part.deleteAttribute(name);
    part.setAttribute('color', new Float32BufferAttribute(colors, 3));
    parts.push(part);
  });
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Model has no meshes');
  merged.computeVertexNormals();
  return merged;
}

export class Models {
  private readonly models = new Map<string, Model>();
  readonly geometries = new Set<BufferGeometry>();

  constructor(private readonly read: (name: string) => Promise<ArrayBuffer | Uint8Array>) {}

  async load(names: Iterable<string>): Promise<void> {
    await Promise.all([...new Set(names)].map((name) => this.loadOne(name)));
  }

  private async loadOne(name: string): Promise<void> {
    if (this.models.has(name)) return;
    const bytes = new Uint8Array(await this.read(name));
    const gltf = await parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const geometry = flatten(gltf.scene);
    const positions = geometry.getAttribute('position').array as Float32Array;
    this.models.set(name, { geometry, positions });
    this.geometries.add(geometry);
  }

  get(name: string): Model {
    const model = this.models.get(name);
    if (!model) throw new Error(`Model is not loaded: ${name}`);
    return model;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    this.geometries.clear();
    this.models.clear();
  }
}
