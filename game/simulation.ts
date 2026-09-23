import {
  Entities,
  Hasher,
  Simulation,
  canonical,
  toQuaternion,
  type Vector,
} from '../src/index.js';
import { PhysicsWorld, RAPIER, type PhysicsObject } from '../src/physics.js';
import { PLAYER_SIZE, getScene, registry, type WorkshopObject } from './scene.js';
import { TPS, idle, move, type Command } from './movement.js';
import type { PublicState } from './protocol.js';

const SLOT_SPACING = 1.5;

interface Player {
  position: Vector;
  physics: PhysicsObject;
}
type Block = Exclude<WorkshopObject, { type: 'spawn' }>;

export class DemoSimulation {
  readonly physics: PhysicsWorld;
  readonly players = new Map<string, Player>();
  readonly objects = new Map<string, PhysicsObject>();
  readonly entities = new Entities<{ dispose(): void }>();
  readonly simulation: Simulation<ReadonlyMap<string, Command>>;
  private readonly spawn: Vector;
  tick = 0;

  constructor(readonly scene: string) {
    const document = getScene(scene);
    const objects = registry.expand(document);
    const spawn = objects.find((entry) => entry.type === 'spawn');
    if (!spawn) throw new Error(`${scene} has no spawn point`);
    this.spawn = spawn.settings.position;
    this.physics = new PhysicsWorld(TPS, document.settings.gravity);
    for (const entry of objects) {
      if (entry.type !== 'spawn') this.place(entry);
    }
    this.simulation = new Simulation(
      [
        { name: 'movement', run: (commands) => this.movePlayers(commands) },
        { name: 'objects', run: () => this.entities.update() },
        { name: 'physics', run: () => this.physics.step() },
        { name: 'tick', run: () => this.tick++ },
      ],
      () => this.release(),
    );
  }

  private place(entry: Block): void {
    const { position, rotation, size } = entry.settings;
    const collider = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2);
    const body = entry.type === 'box' ? RAPIER.RigidBodyDesc.dynamic() : undefined;
    const placed = body ?? collider;
    placed.setTranslation(position.x, position.y, position.z);
    if (rotation) placed.setRotation(toQuaternion(rotation));
    const physics = this.physics.add(body, [collider]);
    this.objects.set(entry.id, physics);
    this.entities.add({ dispose: () => this.physics.remove(physics) }, entry.id);
  }

  private movePlayers(commands: ReadonlyMap<string, Command>): void {
    for (const id of [...this.players.keys()].sort()) {
      const player = this.players.get(id)!;
      move(player.position, commands.get(id) ?? idle());
      player.physics.body!.setNextKinematicTranslation(player.position);
    }
  }

  private release(): void {
    this.entities.dispose();
    this.players.clear();
    this.objects.clear();
    this.physics.dispose();
  }

  join(id: string, slot: number): void {
    if (this.players.has(id)) return;
    const position = { ...this.spawn, x: this.spawn.x + slot * SLOT_SPACING };
    const body = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      position.x,
      position.y,
      position.z,
    );
    const collider = RAPIER.ColliderDesc.cuboid(
      PLAYER_SIZE.x / 2,
      PLAYER_SIZE.y / 2,
      PLAYER_SIZE.z / 2,
    );
    this.players.set(id, { position, physics: this.physics.add(body, [collider]) });
  }

  leave(id: string): void {
    const player = this.players.get(id);
    if (player) this.physics.remove(player.physics);
    this.players.delete(id);
  }

  state(): PublicState {
    const state: PublicState = {};
    for (const [id, player] of this.players) {
      state[id] = {
        type: 'player',
        position: { ...player.position },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      };
    }
    for (const [id, physics] of this.objects) {
      if (!physics.body) continue;
      const { x, y, z } = physics.body.translation();
      const rotation = physics.body.rotation();
      state[id] = {
        type: 'box',
        position: { x, y, z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      };
    }
    return state;
  }

  hash(): number {
    return new Hasher()
      .int(this.tick)
      .bytes(new TextEncoder().encode(canonical(this.state())))
      .bytes(this.physics.snapshot())
      .digest();
  }

  step(commands: ReadonlyMap<string, Command>): void {
    this.simulation.step(commands);
  }

  dispose(): void {
    this.simulation.dispose();
  }
}
