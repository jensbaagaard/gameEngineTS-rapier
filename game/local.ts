// Local mode: the simulation runs in this browser tab, so there is no network and no prediction.
import type { Models } from '../src/assets.js';
import { FixedClock, Session } from '../src/index.js';
import { initPhysics } from '../src/physics.js';
import { TPS, type Command } from './movement.js';
import type { PublicState } from './protocol.js';
import { DemoSimulation } from './simulation.js';
import type { DemoView } from './view.js';

export class LocalClient {
  // Session keeps state that survives scene changes and swaps the level underneath it.
  readonly session: Session<{ changes: number }, DemoSimulation>;
  // FixedClock turns uneven frame times into whole ticks; the leftover fraction is alpha.
  private readonly clock = new FixedClock(1000 / TPS);
  private previous: PublicState; // state after the previous tick
  private current: PublicState; // state after the latest tick

  // Rapier's WebAssembly must be initialized before any simulation is constructed.
  static async create(
    view: DemoView,
    models: Models,
    playerId: string,
    scene: string,
    status: (text: string) => void,
  ): Promise<LocalClient> {
    await initPhysics();
    return new LocalClient(view, models, playerId, scene, status);
  }

  private constructor(
    private readonly view: DemoView,
    private readonly models: Models,
    readonly playerId: string,
    scene: string,
    private readonly status: (text: string) => void,
  ) {
    this.session = new Session({ changes: 0 }, (id) => this.load(id), scene);
    this.current = this.session.level.state();
    this.previous = this.current;
  }

  private load(scene: string): DemoSimulation {
    const simulation = new DemoSimulation(scene, this.models);
    simulation.join(this.playerId, 0);
    return simulation;
  }

  get state(): PublicState {
    return this.session.level.state();
  }

  // Runs the ticks the elapsed time covers, then draws between the last two states.
  frame(elapsedMs: number, readInput: () => Command): void {
    const alpha = this.clock.advance(elapsedMs, () => this.step(readInput()));
    this.view.draw(this.previous, this.current, alpha, this.playerId);
  }

  private step(input: Command): void {
    this.previous = this.current;
    this.session.level.step(new Map([[this.playerId, input]]));
    this.current = this.session.level.state();
  }

  // Session.change() builds the new level, bumps the epoch and disposes the old level.
  change(scene: string): void {
    this.session.change(scene);
    this.session.state.changes++;
    this.current = this.session.level.state();
    this.previous = this.current;
    this.clock.reset();
    this.view.load(scene);
    this.status(`${scene} · ${this.session.state.changes} scene changes · WASD to move`);
  }

  dispose(): void {
    this.session.dispose();
  }
}
