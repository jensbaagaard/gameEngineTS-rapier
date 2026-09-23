import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Models } from '../src/assets.js';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics.js';
import { modelNames, modelUrl } from '../game/scene.js';
import { DemoSimulation } from '../game/simulation.js';

const models = new Models((name) => readFile(modelUrl(name)));
beforeAll(() => Promise.all([initPhysics(), models.load(modelNames)]));

describe('physics ownership', () => {
  it('ignores foreign objects and safely removes objects during collision callbacks', () => {
    const a = new PhysicsWorld(60),
      b = new PhysicsWorld(60);
    try {
      const removedCallback = vi.fn();
      let calls = 0;
      const floor = a.add(undefined, [RAPIER.ColliderDesc.cuboid(10, 0.5, 10)], (other) => {
        calls++;
        expect(() => a.step()).toThrow('reentrant');
        expect(() => a.dispose()).toThrow('during');
        a.remove(other);
      });
      b.remove(floor);
      expect(floor.colliders[0]!.isValid()).toBe(true);
      const ball = a.add(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0),
        [RAPIER.ColliderDesc.ball(0.5)],
        removedCallback,
      );
      for (let i = 0; i < 120; i++) a.step();
      expect(calls).toBe(1);
      expect(ball.body!.isValid()).toBe(false);
      expect(removedCallback).not.toHaveBeenCalled();
    } finally {
      a.dispose();
      b.dispose();
    }
  });
  it('supports compound bodies, collider-only objects, queries and joints', () => {
    const physics = new PhysicsWorld(60);
    try {
      const floor = physics.add(undefined, [RAPIER.ColliderDesc.cuboid(10, 0.5, 10)]);
      const a = physics.add(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0), [
        RAPIER.ColliderDesc.ball(0.5),
        RAPIER.ColliderDesc.ball(0.2).setTranslation(0, 1, 0),
      ]);
      const b = physics.add(RAPIER.RigidBodyDesc.dynamic().setTranslation(1, 3, 0), [
        RAPIER.ColliderDesc.ball(0.5),
      ]);
      physics.world.createImpulseJoint(
        RAPIER.JointData.rope(2, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
        a.body!,
        b.body!,
        true,
      );
      physics.step();
      expect(a.colliders).toHaveLength(2);
      expect(floor.body).toBeUndefined();
      expect(
        physics.world.castRay(
          new RAPIER.Ray({ x: 5, y: 5, z: 5 }, { x: 0, y: -1, z: 0 }),
          10,
          true,
        ),
      ).not.toBeNull();
      physics.remove(a);
      physics.remove(a);
      expect(a.colliders.every((c) => !c.isValid())).toBe(true);
    } finally {
      physics.dispose();
      physics.dispose();
    }
  });
  it.each([false, true])('removes a contacting static object safely (body=%s)', (withBody) => {
    const physics = new PhysicsWorld(60);
    try {
      const ground = physics.add(withBody ? RAPIER.RigidBodyDesc.fixed() : undefined, [
        RAPIER.ColliderDesc.cuboid(10, 0.5, 10),
      ]);
      const box = physics.add(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0), [
        RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5),
      ]);
      for (let i = 0; i < 120; i++) physics.step();
      physics.remove(ground);
      for (let i = 0; i < 60; i++) physics.step();
      expect(box.body!.translation().y).toBeLessThan(0);
    } finally {
      physics.dispose();
    }
  });
  it('places scene objects with their authored rotation and hulls props from their models', () => {
    const sim = new DemoSimulation('workshop', models);
    try {
      const { x, y, z, w } = sim.objects.get('ramp')!.colliders[0]!.rotation();
      const halfAngle = (-10 * Math.PI) / 180;
      expect([x, y]).toEqual([0, 0]);
      expect(z).toBeCloseTo(Math.sin(halfAngle), 6);
      expect(w).toBeCloseTo(Math.cos(halfAngle), 6);
      const crate = sim.objects.get('crate')!.colliders[0]!;
      expect(crate.shape.type).toBe(RAPIER.ShapeType.ConvexPolyhedron);
      expect(crate.translation()).toEqual({ x: 2, y: 0.75, z: -1 });
    } finally {
      sim.dispose();
    }
  });
  it('hashes the entire physics world identically for the same commands', () => {
    const run = () => {
      const sim = new DemoSimulation('workshop', models);
      try {
        sim.join('player:0', 0);
        const hashes: number[] = [];
        for (let i = 0; i < 180; i++) {
          sim.step(new Map([['player:0', { x: 0, z: -1 }]]));
          hashes.push(sim.hash());
        }
        return hashes;
      } finally {
        sim.dispose();
      }
    };
    const hashes = run();
    expect(hashes).toEqual(run());
    expect(hashes.filter((_, index) => (index + 1) % 30 === 0)).toEqual([
      0xe7d0e4d5, 0x751f1551, 0x7add4d24, 0x47320ce5, 0xc3d0bb87, 0xf1612512,
    ]);
  });
});
