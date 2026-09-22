import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { CommandQueue, Replicator, Session, scheduleTicks } from '../src/index.js';
import { initPhysics } from '../src/physics.js';
import { DemoSimulation } from './simulation.js';
import { TPS, idle, type Command } from './movement.js';
import { parseClientMessage, CONTENT, VERSION, type ServerMessage, type Snapshot } from './protocol.js';

interface Client {
  socket: WebSocket;
  id: string;
  slot: number;
  commands: CommandQueue<Command>;
  replicator: Replicator;
}

class Room {
  readonly clients = new Map<WebSocket, Client>();
  readonly session = new Session({ changes: 0 }, scene => new DemoSimulation(scene), 'workshop');
  emptySince = Date.now();
  private stop?: () => void;
  private events: Snapshot['events'] = [];
  private lastChange = -Infinity;

  constructor(readonly password: string) {}

  join(socket: WebSocket): Client {
    if (this.clients.size >= 8) throw new Error('Room is full');
    const slots = new Set([...this.clients.values()].map(c => c.slot));
    let slot = 0;
    while (slots.has(slot)) slot++;
    const client = { socket, id: `player:${slot}`, slot, commands: new CommandQueue<Command>(12, 3), replicator: new Replicator() };
    this.session.level.join(client.id, slot);
    this.clients.set(socket, client);
    this.stop ??= scheduleTicks(TPS, () => this.tick());
    return client;
  }

  leave(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;
    this.session.level.leave(client.id);
    this.clients.delete(socket);
    if (!this.clients.size) {
      this.stop?.();
      this.stop = undefined;
      this.emptySince = Date.now();
    }
  }

  change(scene: string): void {
    if (Date.now() - this.lastChange < 1000) throw new Error('Wait a moment before changing scenes');
    this.lastChange = Date.now();
    this.session.change(scene);
    this.session.state.changes++;
    for (const client of this.clients.values()) {
      client.commands.clear();
      client.replicator.reset();
      this.session.level.join(client.id, client.slot);
    }
    this.events.push({ type: 'scene', scene });
  }

  tick(): void {
    const level = this.session.level;
    const commands = new Map([...this.clients.values()].map(c => [c.id, c.commands.take(idle)]));
    level.step(commands);
    const publicState = level.state();
    for (const client of this.clients.values()) send(client.socket, {
      type: 'snapshot', epoch: this.session.epoch, tick: level.tick, scene: level.scene,
      changes: this.session.state.changes, ack: client.commands.applied,
      patch: client.replicator.encode(publicState), events: this.events,
    });
    this.events = [];
  }

  dispose(): void {
    this.stop?.();
    for (const client of this.clients.values()) client.socket.close(1001, 'Room closed');
    this.clients.clear();
    this.session.dispose();
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.bufferedAmount > 1024 * 1024) { socket.close(1013, 'Client is too slow; reconnect'); return; }
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

export async function startServer(port = 3000, host = '127.0.0.1', roomTtlMs = 600_000) {
  await initPhysics();
  const rooms = new Map<string, Room>();
  const http = createServer();
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, host, () => { http.off('error', reject); resolve(); });
  });
  const websocket = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });
  const alive = new Set<WebSocket>();
  websocket.on('connection', socket => {
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    let room: Room | undefined;
    let client: Client | undefined;
    let windowStart = Date.now(), count = 0;
    socket.on('message', raw => {
      const now = Date.now();
      if (now - windowStart >= 1000) { count = 0; windowStart = now; }
      if (++count > 150) { socket.close(1008, 'Message limit exceeded'); return; }
      try {
        const message = parseClientMessage(String(raw));
        if (message.type === 'join') {
          if (client) throw new Error('Already joined');
          if (message.version !== VERSION) throw new Error('Version mismatch; reload');
          if (message.content !== CONTENT) throw new Error('Scene content mismatch; reload');
          if (!/^[a-zA-Z0-9_-]{1,32}$/.test(message.room)) throw new Error('Use letters, numbers, underscores or hyphens for the room');
          const existing = rooms.get(message.room);
          if (message.create) {
            if (existing) throw new Error('Room already exists');
            if (rooms.size >= 64) throw new Error('Server is full');
            room = new Room(message.password);
            rooms.set(message.room, room);
          } else {
            if (!existing || existing.password !== message.password) throw new Error('Room or password is incorrect');
            room = existing;
          }
          client = room.join(socket);
          send(socket, { type: 'welcome', version: VERSION, id: client.id, epoch: room.session.epoch, position: { ...room.session.level.players.get(client.id)!.position } });
        } else if (!room || !client) throw new Error('Join a room first');
        else if (message.type === 'command') {
          if (message.epoch === room.session.epoch) client.commands.push(message.sequence, message.command);
        } else room.change(message.scene);
      } catch (error) { send(socket, { type: 'error', message: error instanceof Error ? error.message : 'Invalid message' }); }
    });
    socket.on('close', () => { alive.delete(socket); room?.leave(socket); });
    socket.on('error', () => socket.close());
  });
  const heartbeat = setInterval(() => {
    for (const socket of websocket.clients) {
      if (!alive.delete(socket)) socket.terminate();
      else socket.ping();
    }
  }, 30_000);
  const sweep = setInterval(() => {
    for (const [name, room] of rooms) if (!room.clients.size && Date.now() - room.emptySince >= roomTtlMs) { room.dispose(); rooms.delete(name); }
  }, Math.min(1000, Math.max(10, roomTtlMs / 2)));
  const address = http.address();
  return {
    http, rooms, port: typeof address === 'object' && address ? address.port : port,
    async close(): Promise<void> {
      clearInterval(heartbeat);
      clearInterval(sweep);
      for (const room of rooms.values()) room.dispose();
      rooms.clear();
      for (const socket of websocket.clients) socket.terminate();
      await new Promise<void>(resolve => websocket.close(() => resolve()));
      await new Promise<void>(resolve => http.close(() => resolve()));
    },
  };
}
