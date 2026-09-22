import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../game/server.js';
import { CONTENT, VERSION, type ServerMessage, type Snapshot } from '../game/protocol.js';

let server: Awaited<ReturnType<typeof startServer>>;
const sockets: WebSocket[] = [];
beforeEach(async () => { server = await startServer(0, '127.0.0.1', 80); });
afterEach(async () => { for (const socket of sockets.splice(0)) socket.terminate(); await server.close(); });

async function connect() {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
  sockets.push(socket);
  const messages: ServerMessage[] = [];
  socket.on('message', raw => messages.push(JSON.parse(String(raw)) as ServerMessage));
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return { socket, messages, send: (message: unknown) => socket.send(JSON.stringify(message)) };
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    const value = read(); if (value !== undefined) return value;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for server');
}

const join = (room: string, create = true, password = '') => ({ type: 'join', version: VERSION, content: CONTENT, room, password, create });

describe('dedicated server', () => {
  it('refuses mismatched scene content and reports occupied ports', async () => {
    const a = await connect();
    a.send({ ...join('outdated'), content: (CONTENT ^ 1) >>> 0 });
    expect(await waitFor(() => a.messages.find(m => m.type === 'error'))).toMatchObject({ message: 'Scene content mismatch; reload' });
    expect(server.rooms.size).toBe(0);
    await expect(startServer(server.port)).rejects.toMatchObject({ code: 'EADDRINUSE' });
  });
  it('isolates rooms, checks passwords and rejects a second join without spawning', async () => {
    const a = await connect(), b = await connect(), c = await connect();
    a.send(join('first', true, 'secret'));
    await waitFor(() => a.messages.find(m => m.type === 'welcome'));
    b.send(join('first', false, 'wrong'));
    expect((await waitFor(() => b.messages.find(m => m.type === 'error'))).type).toBe('error');
    b.send(join('second'));
    await waitFor(() => b.messages.find(m => m.type === 'welcome'));
    c.send(join('first', false, 'secret'));
    await waitFor(() => c.messages.find(m => m.type === 'welcome'));
    a.send(join('first', false, 'secret'));
    await waitFor(() => a.messages.find(m => m.type === 'error'));
    expect(server.rooms.get('first')!.session.level.players.size).toBe(2);
    expect(server.rooms.get('second')!.session.level.players.size).toBe(1);
  });
  it('validates unknown, null and malformed messages without disconnecting the player', async () => {
    const a = await connect(); a.send(join('validation'));
    await waitFor(() => a.messages.find(m => m.type === 'welcome'));
    a.send(null); a.send({ type: 'bad' }); a.socket.send('{');
    a.send({ type: 'command', epoch: 0, sequence: 1, command: { x: 999, z: 0 } });
    await waitFor(() => a.messages.filter(m => m.type === 'error').length === 4 ? true : undefined);
    expect(server.rooms.get('validation')!.session.level.players.size).toBe(1);
    expect(a.socket.readyState).toBe(WebSocket.OPEN);
  });
  it('acknowledges commands, changes scene without losing slots, and ignores stale inputs', async () => {
    const a = await connect(), b = await connect(); a.send(join('travel'));
    await waitFor(() => a.messages.find(m => m.type === 'welcome'));
    b.send(join('travel', false)); await waitFor(() => b.messages.find(m => m.type === 'welcome'));
    a.send({ type: 'command', epoch: 0, sequence: 1, command: { x: 1, z: 0 } });
    await waitFor(() => a.messages.find(m => m.type === 'snapshot' && m.ack === 1));
    a.send({ type: 'scene', scene: 'courtyard' });
    const snapshot = await waitFor(() => a.messages.find((m): m is Snapshot => m.type === 'snapshot' && m.epoch === 1));
    expect(snapshot.scene).toBe('courtyard'); expect(snapshot.changes).toBe(1);
    expect(snapshot.patch.base).toBeNull();
    expect(Object.keys(snapshot.patch.set)).toContain('player:0');
    expect(Object.keys(snapshot.patch.set)).toContain('player:1');
    expect(Object.keys(snapshot.patch.set)).not.toContain('floor');
    expect(snapshot.events).toEqual([{ type: 'scene', scene: 'courtyard' }]);
    a.send({ type: 'command', epoch: 0, sequence: 2, command: { x: -1, z: 0 } });
    await waitFor(() => a.messages.find(m => m.type === 'snapshot' && m.epoch === 1 && m.tick > snapshot.tick + 3));
    expect(server.rooms.get('travel')!.session.level.players.get('player:0')!.position.x).toBe(0);
  });
  it('bounds pre-join message floods and expires unused rooms', async () => {
    const flood = await connect();
    const closed = new Promise<number>(resolve => flood.socket.once('close', code => resolve(code)));
    for (let i = 0; i < 151; i++) flood.send(null);
    expect(await closed).toBe(1008);
    const a = await connect(); a.send(join('temporary'));
    await waitFor(() => a.messages.find(m => m.type === 'welcome'));
    a.socket.close();
    await waitFor(() => !server.rooms.has('temporary') ? true : undefined);
  });
});
