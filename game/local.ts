import { FixedClock, Session } from '../src/index.js';
import { initPhysics } from '../src/physics.js';
import { TPS, type Command } from './movement.js';
import type { PublicState } from './protocol.js';
import { DemoSimulation } from './simulation.js';
import type { DemoView } from './view.js';

export class LocalClient {
  readonly session: Session<{ changes: number }, DemoSimulation>;
  private readonly clock = new FixedClock(1000 / TPS);
  private previous: PublicState;
  private current: PublicState;

  static async create(
    view: DemoView,
    playerId: string,
    scene: string,
    status: (text: string) => void,
  ): Promise<LocalClient> {
    await initPhysics();
    return new LocalClient(view, playerId, scene, status);
  }

  private constructor(
    private readonly view: DemoView,
    readonly playerId: string,
    scene: string,
    private readonly status: (text: string) => void,
  ) {
    this.session = new Session({ changes: 0 }, (id) => this.load(id), scene);
    this.current = this.session.level.state();
    this.previous = this.current;
  }

  private load(scene: string): DemoSimulation {
    const simulation = new DemoSimulation(scene);
    simulation.join(this.playerId, 0);
    return simulation;
  }

  get state(): PublicState {
    return this.session.level.state();
  }

  frame(elapsedMs: number, readInput: () => Command): void {
    const alpha = this.clock.advance(elapsedMs, () => this.step(readInput()));
    this.view.draw(this.previous, this.current, alpha, this.playerId);
  }

  private step(input: Command): void {
    this.previous = this.current;
    this.session.level.step(new Map([[this.playerId, input]]));
    this.current = this.session.level.state();
  }

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
