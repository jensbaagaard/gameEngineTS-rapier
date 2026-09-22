import { describe, expect, it, vi } from 'vitest';
import {
  CommandQueue,
  Entities,
  FixedClock,
  Hasher,
  Prediction,
  Recorder,
  Replica,
  Replicator,
  Rng,
  Session,
  Simulation,
  SnapshotBuffer,
  TickInbox,
  canonical,
  verifyReplay,
} from '../src/index.js';

describe('fixed simulation', () => {
  it('advances the same ticks across jitter and caps stalls', () => {
    const tick = vi.fn();
    const a = new FixedClock(1000 / 30);
    for (let i = 0; i < 1000; i++) a.advance(1, tick);
    expect(tick).toHaveBeenCalledTimes(30);
    expect(a.alpha).toBeCloseTo(0);
    a.advance(10000, tick);
    expect(tick).toHaveBeenCalledTimes(38);
    expect(a.alpha).toBeLessThan(1);
    expect(() => a.advance(NaN, tick)).toThrow();
  });
  it('orders phases and disposes exactly once', () => {
    const order: string[] = [];
    const release = vi.fn();
    const sim = new Simulation(
      [
        { name: 'movement', run: () => order.push('move') },
        { name: 'physics', run: () => order.push('physics') },
      ],
      release,
    );
    sim.step(undefined);
    expect(order).toEqual(['move', 'physics']);
    sim.dispose();
    sim.dispose();
    expect(release).toHaveBeenCalledTimes(1);
    expect(() => sim.step(undefined)).toThrow('disposed');
    expect(
      () =>
        new Simulation([
          { name: 'same', run() {} },
          { name: 'same', run() {} },
        ]),
    ).toThrow();
  });
  it('rejects recursive stepping and disposal inside a tick', () => {
    const sim = new Simulation([
      {
        name: 'step',
        run: () => {
          expect(() => sim.step(undefined)).toThrow('reentrant');
          expect(() => sim.dispose()).toThrow('during');
        },
      },
    ]);
    sim.step(undefined);
    sim.dispose();
  });
  it('uses stable ids and skips a removed or replaced object in the current tick', () => {
    const world = new Entities<{ update(): void; dispose?(): void }>();
    const updated = vi.fn(),
      disposed = vi.fn();
    world.add({ update: updated, dispose: disposed }, 'b');
    world.add(
      {
        update: () => {
          world.remove('b');
          world.add({ update: updated }, 'b');
        },
      },
      'a',
    );
    world.update();
    expect(updated).not.toHaveBeenCalled();
    expect(disposed).toHaveBeenCalledTimes(1);
    world.dispose();
    expect(() => world.add({ update() {} })).toThrow('disposed');
    expect(new Entities().add({})).toBe(new Entities().add({}));
  });
  it('releases other entities even if one fails', () => {
    const entities = new Entities();
    const release = vi.fn();
    entities.add({
      dispose: () => {
        throw new Error('failed');
      },
    });
    entities.add({ dispose: release });
    expect(() => entities.dispose()).toThrow(AggregateError);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('keeps the old scene on load failure and carries session state on success', () => {
    const released: string[] = [];
    const session = new Session(
      { score: 12 },
      (name, state) => {
        if (name === 'broken') throw new Error('load failed');
        return {
          name,
          score: state.score,
          dispose: () => {
            released.push(name);
          },
        };
      },
      'first',
    );
    expect(() => session.change('broken')).toThrow();
    expect(session.level.name).toBe('first');
    expect(session.epoch).toBe(0);
    session.change('second');
    expect(session.level.score).toBe(12);
    expect(session.epoch).toBe(1);
    expect(released).toEqual(['first']);
    session.dispose();
    session.dispose();
    expect(released).toEqual(['first', 'second']);
  });
});

describe('network state', () => {
  it('applies commands once, rejects old sequences, repeats briefly and bounds backlog', () => {
    const queue = new CommandQueue<{ x: number }>(2, 1);
    expect(queue.push(1, { x: 1 })).toBe(true);
    expect(queue.push(1, { x: 9 })).toBe(false);
    queue.push(3, { x: 3 });
    queue.push(2, { x: 2 });
    expect(queue.take(() => ({ x: 0 }))).toEqual({ x: 1 });
    expect(queue.applied).toBe(1);
    expect(queue.take(() => ({ x: 0 }))).toEqual({ x: 3 });
    expect(queue.take(() => ({ x: 0 }))).toEqual({ x: 3 });
    expect(queue.take(() => ({ x: 0 }))).toEqual({ x: 0 });
    expect(queue.applied).toBe(3);
    for (let i = 4; i < 20; i++) queue.push(i, { x: i });
    expect(queue.length).toBe(2);
    expect(queue.take(() => ({ x: 0 }))).toEqual({ x: 18 });
  });
  it('preserves queued events and changes across scene boundaries', () => {
    const inbox = new TickInbox<{ epoch: number; tick: number; event: string }>(3);
    inbox.push({ epoch: 0, tick: 100, event: 'explosion' });
    inbox.push({ epoch: 1, tick: 1, event: 'arrived' });
    expect(inbox.push({ epoch: 0, tick: 101, event: 'stale' })).toBe(false);
    expect(inbox.push({ epoch: 1, tick: 1, event: 'duplicate' })).toBe(false);
    expect(inbox.drain().map((x) => x.event)).toEqual(['explosion', 'arrived']);
    for (let tick = 2; tick < 5; tick++) inbox.push({ epoch: 1, tick, event: 'tick' });
    expect(() => inbox.push({ epoch: 1, tick: 5, event: 'overflow' })).toThrow('reconnect');
    expect(inbox.length).toBe(3);
  });
  it('projects public state before diffing and sends only changes, including removals', () => {
    const authority = { player: { health: 10, secret: 42 }, field: [0, 1, 0] };
    const writer = new Replicator(),
      reader = new Replica();
    const project = () => ({ player: { health: authority.player.health }, field: authority.field });
    const first = writer.encode(project());
    expect(JSON.stringify(first)).not.toContain('secret');
    reader.apply(first);
    const unchanged = writer.encode(project());
    expect(unchanged.set).toEqual({});
    reader.apply(unchanged);
    authority.field[0] = 1;
    const changed = writer.encode(project());
    expect(Object.keys(changed.set)).toEqual(['field']);
    reader.apply(changed);
    reader.apply(writer.encode({ field: authority.field }));
    expect(reader.state).toEqual({ field: [1, 1, 0] });
    writer.reset();
    reader.apply(writer.encode({ nextScene: true }));
    expect(reader.state).toEqual({ nextScene: true });
  });
  it('detects dropped deltas and tolerates a duplicate', () => {
    const writer = new Replicator(),
      reader = new Replica();
    const first = writer.encode({ a: 1 });
    reader.apply(first);
    expect(reader.apply(first)).toBe(false);
    writer.encode({ a: 2 });
    expect(() => reader.apply(writer.encode({ a: 3 }))).toThrow('baseline');
  });
  it('never writes prototype properties through a patch', () => {
    const reader = new Replica();
    reader.apply({
      base: null,
      revision: 1,
      set: JSON.parse('{"__proto__":{"polluted":true}}'),
      remove: [],
    });
    expect(Object.getPrototypeOf(reader.state)).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(Object.hasOwn(reader.state, '__proto__')).toBe(true);
  });
  it('replays only unacknowledged commands after a correction', () => {
    const prediction = new Prediction(
      { x: 0 },
      (s, c: number) => {
        s.x += c;
      },
      3,
    );
    prediction.push(1);
    prediction.push(2);
    prediction.correct({ x: 0.5 }, 1);
    expect(prediction.state.x).toBe(2.5);
    prediction.correct({ x: 2 }, 2);
    expect(prediction.state.x).toBe(2);
    expect(() => prediction.correct({ x: 0 }, 3)).toThrow();
  });
  it('interpolates across jitter and holds the latest sample without unbounded extrapolation', () => {
    const buffer = new SnapshotBuffer<number>();
    buffer.push(1, 10);
    buffer.push(4, 40);
    expect(buffer.sample(2)).toEqual({ from: 10, to: 40, alpha: 1 / 3 });
    expect(buffer.sample(100)).toEqual({ from: 40, to: 40, alpha: 0 });
    expect(() => buffer.sample(NaN)).toThrow('presentation tick');
    buffer.clear();
    expect(buffer.sample(2)).toBeUndefined();
  });
});

describe('deterministic utilities', () => {
  it('rejects state that cannot survive a JSON round trip', () => {
    for (const value of [NaN, undefined, new Array(2), new Map(), new Date(), { x: undefined }])
      expect(() => canonical(value as any)).toThrow();
    const cyclic: any = {};
    cyclic.self = cyclic;
    expect(() => canonical(cyclic)).toThrow('deeply nested');
    expect(canonical({ b: 1, a: [true, null] })).toBe('{"a":[true,null],"b":1}');
  });
  it('restores the random stream and rejects invalid ranges', () => {
    const rng = new Rng(7);
    const state = rng.state();
    const values = Array.from({ length: 100 }, () => rng.nextU32());
    rng.setState(state);
    expect(Array.from({ length: 100 }, () => rng.nextU32())).toEqual(values);
    expect(() => rng.nextInt(0)).toThrow();
    expect(() => rng.setState([0, 0, 0, 0])).toThrow();
    expect(() => rng.setState([1, 2, 3, -1])).toThrow();
  });
  it('verifies replays, reports first divergence, and frees simulations on failure', () => {
    const dispose = vi.fn();
    const create = () => {
      let n = 0;
      return {
        step: (c: number) => {
          n += c;
        },
        hash: () => new Hasher().int(n).digest(),
        dispose,
      };
    };
    const recorder = new Recorder<number>('v1', 'scene');
    const sim = create();
    for (const c of [1, 2, 3]) {
      sim.step(c);
      recorder.record(c, sim.hash());
    }
    expect(verifyReplay(recorder.replay, 'v1', 'scene', create)).toBeNull();
    recorder.replay.commands[1] = 4;
    expect(verifyReplay(recorder.replay, 'v1', 'scene', create)).toBe(1);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(() => verifyReplay(recorder.replay, 'v2', 'scene', create)).toThrow('mismatch');
  });
});
