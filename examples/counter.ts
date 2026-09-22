import { Entities, Hasher, Recorder, Simulation, verifyReplay } from '../src/index.js';

function create() {
  let value = 0;
  const entities = new Entities<{ update(): void }>();
  entities.add({
    update: () => {
      value++;
    },
  });
  const simulation = new Simulation<number>(
    [
      {
        name: 'commands',
        run: (command) => {
          value += command;
        },
      },
      { name: 'objects', run: () => entities.update() },
    ],
    () => entities.dispose(),
  );
  return {
    step: (command: number) => simulation.step(command),
    hash: () => new Hasher().int(value).digest(),
    dispose: () => simulation.dispose(),
  };
}

const simulation = create();
const recorder = new Recorder<number>('counter-v1', 'counter');
for (let i = 0; i < 600; i++) {
  simulation.step(i % 3);
  recorder.record(i % 3, simulation.hash());
}
simulation.dispose();
if (verifyReplay(recorder.replay, 'counter-v1', 'counter', create) !== null)
  throw new Error('Replay diverged');
process.stdout.write(
  JSON.stringify({ ticks: 600, hash: recorder.replay.hashes.at(-1), replay: 'verified' }) + '\n',
);
