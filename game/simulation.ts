import { Entities, Hasher, Simulation, canonical, type Properties } from '../src/index.js';
import { PhysicsWorld, RAPIER, type PhysicsObject } from '../src/physics.js';
import { getScene, registry, type Vector } from './scene.js';
import { TPS, idle, move, type Command } from './movement.js';

interface Player { position: Vector; physics: PhysicsObject }

export class DemoSimulation {
  readonly physics: PhysicsWorld;
  readonly players = new Map<string, Player>();
  readonly objects = new Map<string, PhysicsObject>();
  readonly entities = new Entities<{ dispose(): void }>();
  readonly simulation: Simulation<ReadonlyMap<string, Command>>;
  tick = 0;

  constructor(readonly scene: string) {
    const document = getScene(scene);
    const entries = registry.expand(document);
    this.physics = new PhysicsWorld(TPS, document.settings.gravity as unknown as Vector);
    for (const entry of entries) {
      if (entry.type === 'spawn') continue;
      const { position, size } = entry.settings as unknown as { position: Vector; size: Vector };
      const collider = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
      const body = entry.type === 'box' ? RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z) : undefined;
      if (!body) collider.setTranslation(position.x, position.y, position.z);
      const physics = this.physics.add(body, [collider]);
      this.objects.set(entry.id, physics);
      this.entities.add({ dispose: () => this.physics.remove(physics) }, entry.id);
    }
    this.simulation = new Simulation([
      { name: 'movement', run: commands => {
        for (const id of [...this.players.keys()].sort()) {
          const player = this.players.get(id)!;
          move(player.position, commands.get(id) ?? idle());
          player.physics.body!.setNextKinematicTranslation(player.position);
        }
      } },
      { name: 'objects', run: () => this.entities.update() },
      { name: 'physics', run: () => this.physics.step() },
      { name: 'tick', run: () => { this.tick++; } },
    ], () => { this.entities.dispose(); this.players.clear(); this.objects.clear(); this.physics.dispose(); });
  }

  join(id: string, slot: number): void {
    if (this.players.has(id)) return;
    const spawn = registry.expand(getScene(this.scene)).find(entry => entry.type === 'spawn')!;
    const position = { ...(spawn.settings.position as unknown as Vector) };
    position.x += slot * 1.5;
    const body = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(position.x, position.y, position.z);
    this.players.set(id, { position, physics: this.physics.add(body, [RAPIER.ColliderDesc.cuboid(0.45, 0.75, 0.45)]) });
  }

  leave(id: string): void {
    const player = this.players.get(id);
    if (player) this.physics.remove(player.physics);
    this.players.delete(id);
  }

  state(): Properties {
    const state: Properties = {};
    for (const [id, player] of this.players) state[id] = { type: 'player', position: { ...player.position }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    for (const [id, physics] of this.objects) {
      if (!physics.body) continue;
      const p = physics.body.translation(), q = physics.body.rotation();
      state[id] = { type: 'box', position: { x: p.x, y: p.y, z: p.z }, rotation: { x: q.x, y: q.y, z: q.z, w: q.w } };
    }
    return state;
  }

  hash(): number {
    return new Hasher().int(this.tick).bytes(new TextEncoder().encode(canonical(this.state()))).bytes(this.physics.snapshot()).digest();
  }
  step(commands: ReadonlyMap<string, Command>): void { this.simulation.step(commands); }
  dispose(): void { this.simulation.dispose(); }
}
