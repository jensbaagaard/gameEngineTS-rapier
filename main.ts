import {
  FixedClock,
  Prediction,
  Replica,
  Session,
  SnapshotBuffer,
  TickInbox,
  type Properties,
} from './src/index.js';
import { Keyboard, createRenderer } from './src/browser.js';
import { TPS, move, type Command } from './game/movement.js';
import { CONTENT, VERSION, type ServerMessage, type Snapshot } from './game/protocol.js';
import { getScene, registry, type Vector } from './game/scene.js';
import { DemoView, type Pose } from './game/view.js';
import type { DemoSimulation } from './game/simulation.js';

const query = new URLSearchParams(location.search);
const mode = query.has('preview') ? 'preview' : query.has('online') ? 'online' : 'local';
const canvas = document.querySelector('canvas')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const roomForm = document.querySelector<HTMLFormElement>('#room')!;
const renderer = await createRenderer(canvas, query.get('gl') === 'webgl').catch((error) => {
  status.textContent = error instanceof Error ? error.message : 'Graphics initialization failed';
  throw error;
});
const view = new DemoView(renderer);
const keyboard = new Keyboard();
const listeners = new AbortController();
const clock = new FixedClock(1000 / TPS);
const inbox = new TickInbox<Snapshot>();
const history = new SnapshotBuffer<Properties>();
let replica = new Replica();
let prediction: Prediction<Vector, Command> | undefined;
let local: Session<{ changes: number }, DemoSimulation> | undefined;
let socket: WebSocket | undefined;
let playerId = 'player:0';
let epoch = 0;
let renderTick = -1;
let correction: Vector = { x: 0, y: 0, z: 0 };
let previous: Properties = {},
  current: Properties = {};
let last: number | undefined;
let frame = 0;
let closed = false;
view.load('workshop');
roomForm.hidden = mode !== 'online';
status.textContent =
  mode === 'preview'
    ? 'Scene preview · no simulation running'
    : mode === 'online'
      ? 'Create or join a room'
      : 'Local game · WASD to move';

if (mode === 'local') {
  const { initPhysics } = await import('./src/physics.js');
  const { DemoSimulation } = await import('./game/simulation.js');
  await initPhysics();
  local = new Session(
    { changes: 0 },
    (scene) => {
      const sim = new DemoSimulation(scene);
      sim.join(playerId, 0);
      return sim;
    },
    'workshop',
  );
  current = local.level.state();
  previous = current;
}

function command(): Command {
  return {
    x: +keyboard.down('KeyD') - +keyboard.down('KeyA'),
    z: +keyboard.down('KeyS') - +keyboard.down('KeyW'),
  };
}

function disconnect(message: string): void {
  socket?.close();
  socket = undefined;
  prediction = undefined;
  keyboard.clear();
  status.textContent = message;
  roomForm.hidden = mode !== 'online';
  if (mode !== 'online') closed = true;
}

roomForm.addEventListener(
  'submit',
  (event) => {
    event.preventDefault();
    if (socket) return;
    const form = new FormData(roomForm);
    const create = (event.submitter as HTMLButtonElement).value === 'create';
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
    );
    socket = ws;
    status.textContent = 'Connecting…';
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: 'join',
          version: VERSION,
          content: CONTENT,
          room: form.get('room'),
          password: form.get('password'),
          create,
        }),
      );
    ws.onmessage = (event) => {
      if (socket !== ws) return;
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'error') {
          status.textContent = message.message;
          if (!prediction) disconnect(message.message);
        } else if (message.type === 'welcome') {
          if (message.version !== VERSION) throw new Error('Version mismatch; reload');
          playerId = message.id;
          epoch = message.epoch;
          inbox.clear();
          history.clear();
          replica = new Replica();
          renderTick = -1;
          prediction = new Prediction(message.position, move);
          roomForm.hidden = true;
          status.textContent = `Online · ${playerId} · WASD to move`;
        } else if (message.type === 'snapshot') inbox.push(message);
        else throw new Error('Unknown server message');
      } catch (error) {
        disconnect(error instanceof Error ? error.message : 'Connection failed');
      }
    };
    ws.onclose = (event) => {
      if (socket === ws) disconnect(event.reason || 'Disconnected · join again to synchronize');
    };
    ws.onerror = () => {
      if (socket === ws) disconnect('Could not connect');
    };
  },
  { signal: listeners.signal },
);

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scene]'))
  button.addEventListener(
    'click',
    () => {
      const scene = button.dataset.scene!;
      if (mode === 'online') {
        if (socket?.readyState === WebSocket.OPEN && prediction)
          socket.send(JSON.stringify({ type: 'scene', scene }));
        return;
      }
      if (local) {
        local.change(scene);
        local.state.changes++;
        current = local.level.state();
        previous = current;
        clock.reset();
      }
      view.load(scene);
      status.textContent =
        mode === 'preview'
          ? `${scene} · no simulation running`
          : `${scene} · ${local!.state.changes} scene changes · WASD to move`;
    },
    { signal: listeners.signal },
  );

document.querySelector('#export')!.addEventListener(
  'click',
  () => {
    const document = registry.bake(getScene(view.currentScene), 'stack');
    const url = URL.createObjectURL(
      new Blob([registry.serialize(document)], { type: 'application/json' }),
    );
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = `${document.id}.scene.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  { signal: listeners.signal },
);

function receive(): void {
  for (const snapshot of inbox.drain()) {
    const changed = epoch !== snapshot.epoch;
    replica.apply(snapshot.patch);
    const me = replica.state[playerId] as unknown as Pose;
    if (changed || view.currentScene !== snapshot.scene) {
      epoch = snapshot.epoch;
      view.load(snapshot.scene);
      history.clear();
      renderTick = -1;
      prediction?.reset({ ...me.position });
      correction = { x: 0, y: 0, z: 0 };
    }
    if (prediction && me) {
      const before = { ...prediction.state };
      prediction.correct(me.position, snapshot.ack);
      const dx = before.x - prediction.state.x,
        dz = before.z - prediction.state.z;
      if (!changed && Math.hypot(dx, dz) < 3) {
        correction.x += dx;
        correction.z += dz;
      } else correction = { x: 0, y: 0, z: 0 };
    }
    history.push(snapshot.tick, replica.state);
    for (const event of snapshot.events)
      status.textContent = `${event.scene} · ${snapshot.changes} scene changes · ${playerId}`;
  }
}

function draw(now: number): void {
  if (closed) return;
  const elapsed = last === undefined ? 0 : Math.min(250, now - last);
  last = now;
  try {
    receive();
    const alpha = clock.advance(elapsed, () => {
      const input = command();
      if (local) {
        previous = current;
        local.level.step(new Map([[playerId, input]]));
        current = local.level.state();
      } else if (prediction && socket?.readyState === WebSocket.OPEN) {
        const sequence = prediction.push(input);
        socket.send(JSON.stringify({ type: 'command', epoch, sequence, command: input }));
      }
    });
    if (local) view.draw(previous, current, alpha, playerId);
    else if (history.newestTick >= 0) {
      const target = history.newestTick - 2;
      if (renderTick < 0 || Math.abs(target - renderTick) > 8) renderTick = target;
      else {
        renderTick += (elapsed / 1000) * TPS;
        renderTick += (target - renderTick) * (1 - Math.exp(-elapsed / 500));
      }
      const sample = history.sample(renderTick)!;
      correction.x *= Math.exp(-elapsed / 80);
      correction.z *= Math.exp(-elapsed / 80);
      const position = prediction
        ? {
            x: prediction.state.x + correction.x,
            y: prediction.state.y,
            z: prediction.state.z + correction.z,
          }
        : undefined;
      view.draw(sample.from, sample.to, sample.alpha, playerId, position);
    } else view.render();
  } catch (error) {
    disconnect(error instanceof Error ? error.message : 'Simulation failed');
  }
  if (!closed) frame = requestAnimationFrame(draw);
}
frame = requestAnimationFrame(draw);
window.addEventListener(
  'pagehide',
  () => {
    closed = true;
    cancelAnimationFrame(frame);
    socket?.close();
    local?.dispose();
    keyboard.dispose();
    listeners.abort();
    view.dispose();
  },
  { once: true },
);

Object.assign(window, {
  __engine: {
    mode,
    view,
    get local() {
      return local;
    },
    get state() {
      return local?.level.state() ?? replica.state;
    },
  },
});
