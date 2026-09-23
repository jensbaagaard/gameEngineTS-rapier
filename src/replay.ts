import type { Json } from './schema.js';

export interface Replay<C, S extends Json = Json> {
  version: 1;
  build: string;
  scene: string;
  setup?: S;
  commands: C[];
  hashes: number[];
}

export interface ReplaySimulation<C> {
  step(command: C): void;
  hash(): number;
  dispose(): void;
}

export class Recorder<C, S extends Json = Json> {
  readonly replay: Replay<C, S>;
  constructor(build: string, scene: string, setup?: S) {
    this.replay = { version: 1, build, scene, commands: [], hashes: [] };
    if (setup !== undefined) this.replay.setup = structuredClone(setup);
  }
  record(command: C, hash: number): void {
    this.replay.commands.push(structuredClone(command));
    this.replay.hashes.push(hash);
  }
}

export function verifyReplay<C, S extends Json = Json>(
  replay: Replay<C, S>,
  build: string,
  scene: string,
  create: (setup: S | undefined) => ReplaySimulation<C>,
): number | null {
  if (
    replay.version !== 1 ||
    replay.build !== build ||
    replay.scene !== scene ||
    replay.commands.length !== replay.hashes.length
  )
    throw new Error('Replay version, build, scene or length mismatch');
  const simulation = create(replay.setup);
  try {
    for (let tick = 0; tick < replay.commands.length; tick++) {
      simulation.step(structuredClone(replay.commands[tick]!));
      if (simulation.hash() !== replay.hashes[tick]) return tick;
    }
    return null;
  } finally {
    simulation.dispose();
  }
}
