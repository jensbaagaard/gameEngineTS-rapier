import { Models } from './src/assets.js';
import { Keyboard, createRenderer } from './src/browser.js';
import type { Command } from './game/movement.js';
import { OnlineClient } from './game/online.js';
import { getScene, modelNames, modelUrl, registry } from './game/scene.js';
import { DemoView } from './game/view.js';

const query = new URLSearchParams(location.search);
const mode = query.has('preview') ? 'preview' : query.has('online') ? 'online' : 'local';
const canvas = document.querySelector('canvas')!;
const status = document.querySelector<HTMLOutputElement>('#status')!;
const roomForm = document.querySelector<HTMLFormElement>('#room')!;
const listeners = new AbortController();

function setStatus(text: string): void {
  status.textContent = text;
}

const renderer = await createRenderer(canvas, query.get('gl') === 'webgl').catch((error) => {
  setStatus(error instanceof Error ? error.message : 'Graphics initialization failed');
  throw error;
});
const models = new Models((name) =>
  fetch(modelUrl(name)).then((response) => response.arrayBuffer()),
);
await models.load(modelNames);
const view = new DemoView(renderer, models);
const keyboard = new Keyboard();
view.load('workshop');

async function createLocalClient() {
  const { LocalClient } = await import('./game/local.js');
  return LocalClient.create(view, models, 'player:0', 'workshop', setStatus);
}

function inRoom(value: boolean): void {
  roomForm.hidden = value;
  if (!value) keyboard.clear();
}

const local = mode === 'local' ? await createLocalClient() : undefined;
const online =
  mode === 'online' ? new OnlineClient(view, { status: setStatus, inRoom }) : undefined;
const client = local ?? online;
roomForm.hidden = !online;
setStatus(
  {
    local: 'Local game · WASD to move',
    online: 'Create or join a room',
    preview: 'Scene preview · no simulation running',
  }[mode],
);

function readInput(): Command {
  return {
    x: +keyboard.down('KeyD') - +keyboard.down('KeyA'),
    z: +keyboard.down('KeyS') - +keyboard.down('KeyW'),
  };
}

function changeScene(scene: string): void {
  if (client) {
    client.change(scene);
    return;
  }
  view.load(scene);
  setStatus(`${scene} · no simulation running`);
}

function exportScene(): void {
  const baked = registry.bake(getScene(view.currentScene), 'stack');
  const blob = new Blob([registry.serialize(baked)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${baked.id}.scene.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

roomForm.addEventListener(
  'submit',
  (event) => {
    event.preventDefault();
    const form = new FormData(roomForm);
    const create = (event.submitter as HTMLButtonElement).value === 'create';
    online?.join(String(form.get('room')), String(form.get('password')), create);
  },
  { signal: listeners.signal },
);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-scene]')) {
  button.addEventListener('click', () => changeScene(button.dataset.scene!), {
    signal: listeners.signal,
  });
}
document.querySelector('#export')!.addEventListener('click', exportScene, {
  signal: listeners.signal,
});

let last: number | undefined;
let frame = requestAnimationFrame(loop);

function loop(now: number): void {
  const elapsed = last === undefined ? 0 : Math.min(250, now - last);
  last = now;
  try {
    if (client) client.frame(elapsed, readInput);
    else view.render();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Simulation failed');
    return;
  }
  frame = requestAnimationFrame(loop);
}

window.addEventListener(
  'pagehide',
  () => {
    cancelAnimationFrame(frame);
    client?.dispose();
    keyboard.dispose();
    listeners.abort();
    view.dispose();
    models.dispose();
  },
  { once: true },
);

Object.assign(window, {
  __engine: {
    mode,
    view,
    models,
    local: local?.session,
    get state() {
      return client?.state ?? {};
    },
  },
});
