export interface Replay<C> {
  version: 1;
  build: string;
  scene: string;
  commands: C[];
  hashes: number[];
}

export interface ReplaySimulation<C> {
  step(command: C): void;
  hash(): number;
  dispose(): void;
}

export class Recorder<C> {
  readonly replay: Replay<C>;
  constructor(build: string, scene: string) {
    this.replay = { version: 1, build, scene, commands: [], hashes: [] };
  }
  record(command: C, hash: number): void {
    this.replay.commands.push(structuredClone(command));
    this.replay.hashes.push(hash);
  }
}

export function verifyReplay<C>(replay: Replay<C>, build: string, scene: string, create: () => ReplaySimulation<C>): number | null {
  if (replay.version !== 1 || replay.build !== build || replay.scene !== scene || replay.commands.length !== replay.hashes.length) throw new Error('Replay version, build, scene or length mismatch');
  const simulation = create();
  try {
    for (let tick = 0; tick < replay.commands.length; tick++) {
      simulation.step(structuredClone(replay.commands[tick]!));
      if (simulation.hash() !== replay.hashes[tick]) return tick;
    }
    return null;
  } finally { simulation.dispose(); }
}
