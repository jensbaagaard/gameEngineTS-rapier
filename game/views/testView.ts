import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
} from "three";
import type { View } from "../../engine/interfaces/View";

const boxGeometry = new BoxGeometry(0.2, 0.2, 0.2);
const boxMaterial = new MeshStandardMaterial({ color: 0xffaa33 });

export const testView: View = {
  visuals: {
    box: () => new Mesh(boxGeometry, boxMaterial),
    player: () =>
      new Mesh(
        new BoxGeometry(1, 1, 1),
        new MeshStandardMaterial({ color: 0x3388ff })
      ),
    ground: () =>
      new Mesh(
        new BoxGeometry(20, 0.5, 20),
        new MeshStandardMaterial({ color: 0x556677 })
      ),
  },

  setup({ scene, camera }) {
    const sun = new DirectionalLight(0xffffff, 3);
    sun.position.set(5, 10, 7);
    scene.add(sun, new AmbientLight(0xffffff, 0.5));
    camera.position.set(0, 5, 12);
  },

  update({ camera, meshes }, objects, playerId) {
    const me = objects.find(
      (obj) => obj.tag === "player" && obj.owner === playerId
    );
    const mesh = me && meshes.get(me.id);
    if (mesh) camera.lookAt(mesh.position);
  },
};
