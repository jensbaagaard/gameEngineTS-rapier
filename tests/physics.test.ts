import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initPhysics, PhysicsWorld, RAPIER } from '../src/physics.js';
import { DemoSimulation } from '../game/simulation.js';

beforeAll(initPhysics);

describe('physics ownership', () => {
  it('ignores foreign objects and safely removes objects during collision callbacks', () => {
    const a = new PhysicsWorld(60), b = new PhysicsWorld(60);
    try {
      const removedCallback = vi.fn();
      let calls = 0;
      const floor = a.add(undefined, [RAPIER.ColliderDesc.cuboid(10, 0.5, 10)], other => {
        calls++;
        expect(() => a.step()).toThrow('reentrant');
        expect(() => a.dispose()).toThrow('during');
        a.remove(other);
      });
      b.remove(floor);
      expect(floor.colliders[0]!.isValid()).toBe(true);
      const ball = a.add(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0), [RAPIER.ColliderDesc.ball(0.5)], removedCallback);
      for (let i = 0; i < 120; i++) a.step();
      expect(calls).toBe(1);
      expect(ball.body!.isValid()).toBe(false);
      expect(removedCallback).not.toHaveBeenCalled();
    } finally { a.dispose(); b.dispose(); }
  });
  it('supports compound bodies, collider-only objects, queries and joints', () => {
    const physics = new PhysicsWorld(60);
    try {
      const floor = physics.add(undefined, [RAPIER.ColliderDesc.cuboid(10, 0.5, 10)]);
      const a = physics.add(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0), [RAPIER.ColliderDesc.ball(0.5), RAPIER.ColliderDesc.ball(0.2).setTranslation(0, 1, 0)]);
      const b = physics.add(RAPIER.RigidBodyDesc.dynamic().setTranslation(1, 3, 0), [RAPIER.ColliderDesc.ball(0.5)]);
      physics.world.createImpulseJoint(RAPIER.JointData.rope(2, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), a.body!, b.body!, true);
      physics.step();
      expect(a.colliders).toHaveLength(2);
      expect(floor.body).toBeUndefined();
      expect(physics.world.castRay(new RAPIER.Ray({ x: 5, y: 5, z: 5 }, { x: 0, y: -1, z: 0 }), 10, true)).not.toBeNull();
      physics.remove(a); physics.remove(a);
      expect(a.colliders.every(c => !c.isValid())).toBe(true);
    } finally { physics.dispose(); physics.dispose(); }
  });
  it.each([false, true])('removes a contacting static object safely (body=%s)', withBody => {
    const physics = new PhysicsWorld(60);
    try {
      const ground = physics.add(withBody ? RAPIER.RigidBodyDesc.fixed() : undefined, [RAPIER.ColliderDesc.cuboid(10, 0.5, 10)]);
      const box = physics.add(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0), [RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)]);
      for (let i = 0; i < 120; i++) physics.step();
      physics.remove(ground);
      for (let i = 0; i < 60; i++) physics.step();
      expect(box.body!.translation().y).toBeLessThan(0);
    } finally { physics.dispose(); }
  });
  it('hashes the entire physics world identically for the same commands', () => {
    const run = () => {
      const sim = new DemoSimulation('workshop');
      try {
        sim.join('player:0', 0);
        const hashes: number[] = [];
        for (let i = 0; i < 180; i++) { sim.step(new Map([['player:0', { x: 0, z: -1 }]])); hashes.push(sim.hash()); }
        return hashes;
      } finally { sim.dispose(); }
    };
    const hashes = run();
    expect(hashes).toEqual(run());
    expect(hashes.filter((_, index) => (index + 1) % 30 === 0)).toEqual([
      0x50ca586f, 0xbc1a7958, 0x95a7f15e, 0xf7231ce0, 0x9c07595d, 0x6e9a92df,
    ]);
  });
});
