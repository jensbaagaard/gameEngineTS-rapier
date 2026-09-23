import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';
import { Models } from '../src/assets.js';
import { startServer } from '../game/server.js';
import { DemoSimulation } from '../game/simulation.js';
import { modelNames, modelUrl, registry, scenes } from '../game/scene.js';

const server = await startServer(0);
const vite = await createServer({
  server: { middlewareMode: true, hmr: { server: server.http } },
  appType: 'spa',
}).catch(async (error) => {
  await server.close();
  throw error;
});
server.http.on('request', vite.middlewares);
const browser = await chromium
  .launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  .catch(async (error) => {
    await vite.close();
    await server.close();
    throw error;
  });
const errors: string[] = [];
const base = `http://127.0.0.1:${server.port}`;
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
await mkdir('evidence/browser', { recursive: true });

async function open(query = ''): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`${base}/?gl=webgl${query}`);
  await page.waitForFunction(() => !!(window as any).__engine);
  return page;
}

async function ticks(page: Page, count: number): Promise<void> {
  const until = await page.evaluate(
    (count) => (window as any).__engine.local.level.tick + count,
    count,
  );
  await page.waitForFunction((until) => (window as any).__engine.local.level.tick >= until, until);
}

async function rendered(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

const x = (page: Page) =>
  page.evaluate(() => (window as any).__engine.state['player:0'].position.x as number);
const memory = (page: Page) =>
  page.evaluate(() => {
    const memory = (window as any).__engine.view.renderer.info.memory;
    return { geometries: memory.geometries, textures: memory.textures };
  });

try {
  const local = await open();
  await rendered(local);
  assert.match(await local.locator('#status').innerText(), /Local game/);
  const initial = await x(local);
  await local.keyboard.down('d');
  await ticks(local, 12);
  assert.ok((await x(local)) > initial + 0.5, 'Local input should move immediately');
  await local.keyboard.down('Shift');
  await local.keyboard.up('d');
  await local.keyboard.up('Shift');
  const stopped = await x(local);
  await ticks(local, 8);
  assert.equal(await x(local), stopped, 'Shift must not leave movement stuck');
  await local.keyboard.down('d');
  await local.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await x(local);
  await ticks(local, 8);
  assert.equal(await x(local), blurred, 'Blur must release movement');
  await local.keyboard.up('d');
  const visit = async (scene: string) => {
    await local.locator(`[data-scene="${scene}"]`).click();
    await rendered(local);
  };
  await visit('courtyard');
  await visit('workshop');
  const baseline = await memory(local);
  for (let i = 0; i < 8; i++) {
    await visit('courtyard');
    await visit('workshop');
  }
  assert.deepEqual(
    await memory(local),
    baseline,
    'Scene changes must release everything but shared model geometry',
  );
  assert.equal(await local.evaluate(() => (window as any).__engine.local.state.changes), 18);
  await local.screenshot({ path: 'evidence/browser/local.jpg', type: 'jpeg', quality: 85 });

  const nodeHashes: number[] = [];
  const models = new Models((name) => readFile(modelUrl(name)));
  await models.load(modelNames);
  const sim = new DemoSimulation('workshop', models);
  try {
    sim.join('player:0', 0);
    for (let i = 0; i < 180; i++) {
      sim.step(new Map([['player:0', { x: 0, z: -1 }]]));
      if ((i + 1) % 30 === 0) nodeHashes.push(sim.hash());
    }
  } finally {
    sim.dispose();
  }
  const browserHashes = await local.evaluate(async () => {
    const path = '/game/simulation.ts';
    const { DemoSimulation } = await import(path);
    const sim = new DemoSimulation('workshop', (window as any).__engine.models);
    try {
      sim.join('player:0', 0);
      const hashes: number[] = [];
      for (let i = 0; i < 180; i++) {
        sim.step(new Map([['player:0', { x: 0, z: -1 }]]));
        if ((i + 1) % 30 === 0) hashes.push(sim.hash());
      }
      return hashes;
    } finally {
      sim.dispose();
    }
  });
  assert.deepEqual(
    browserHashes,
    nodeHashes,
    'Node and Chromium must agree, including full Rapier snapshots',
  );

  const preview = await context.newPage();
  const requests: string[] = [];
  preview.on('request', (request) => requests.push(request.url()));
  await preview.goto(`${base}/?preview&gl=webgl`);
  await preview.waitForFunction(() => !!(window as any).__engine);
  await rendered(preview);
  assert.match(
    await preview.locator('#status').innerText(),
    /Scene preview · no simulation running/,
  );
  assert.equal(await preview.locator('#room').isVisible(), false);
  assert.equal(
    requests.some((url) => /rapier|\/src\/physics\.ts|\/game\/simulation\.ts/.test(url)),
    false,
    'Scene preview must not load physics',
  );
  assert.equal(await preview.evaluate(() => (window as any).__engine.local), undefined);
  const downloaded = preview.waitForEvent('download');
  await preview.locator('#export').click();
  const download = await downloaded;
  const baked = registry.parse(await readFile((await download.path())!, 'utf8'));
  assert.equal(
    baked.objects.some((entry) => 'seed' in entry),
    false,
  );
  assert.deepEqual(registry.expand(baked), registry.expand(scenes.workshop));
  await preview.screenshot({ path: 'evidence/browser/preview.jpg', type: 'jpeg', quality: 85 });

  const a = await open('&online');
  await a.locator('[name="room"]').fill('browser');
  await a.locator('[name="password"]').fill('test');
  await a.locator('button[value="create"]').click();
  await a.waitForFunction(() => !!(window as any).__engine.state['player:0']);
  const b = await open('&online');
  await b.locator('[name="room"]').pressSequentially('browser');
  assert.equal(
    await b.locator('[name="room"]').inputValue(),
    'browser',
    'Text fields must retain typed input',
  );
  await b.locator('[name="password"]').fill('test');
  await b.locator('button[value="join"]').click();
  await b.waitForFunction(() => !!(window as any).__engine.state['player:1']);
  await a.waitForFunction(() => !!(window as any).__engine.state['player:1']);
  await a.bringToFront();
  await a.keyboard.down('d');
  await a.waitForFunction(() => (window as any).__engine.state['player:0'].position.x > 1);
  await a.keyboard.up('d');
  await b.waitForFunction(() => (window as any).__engine.state['player:0'].position.x > 1);
  await a.locator('[data-scene="courtyard"]').click();
  for (const page of [a, b]) {
    await page.waitForFunction(() => (window as any).__engine.view.currentScene === 'courtyard');
    assert.match(await page.locator('#status').innerText(), /1 scene changes/);
  }
  assert.equal(server.rooms.get('browser')!.session.state.changes, 1);
  assert.deepEqual(
    [...server.rooms.get('browser')!.session.level.players.keys()],
    ['player:0', 'player:1'],
  );
  await b.screenshot({ path: 'evidence/browser/online.jpg', type: 'jpeg', quality: 85 });
  assert.deepEqual(errors, [], 'Browser should have no uncaught errors');
  process.stdout.write(
    `Browser checks passed: local input, disposal, preview, baking, two-player rooms, travel.\nNode/Chromium physics hashes: ${nodeHashes.map((hash) => hash.toString(16)).join(', ')}\nCaptures: evidence/browser/\n`,
  );
} finally {
  await browser.close();
  await vite.close();
  await server.close();
}
