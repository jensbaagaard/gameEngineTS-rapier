import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { CommandQueue, Replicator, Session, scheduleTicks } from '../src/index.js';
import { initPhysics } from '../src/physics.js';
import { DemoSimulation } from './simulation.js';
import { TPS, idle, type Command } from './movement.js';
import {
  parseClientMessage,
  CONTENT,
  VERSION,
  type JoinMessage,
  type PublicState,
  type ServerMessage,
  type Snapshot,
} from './protocol.js';

const MAX_PLAYERS = 8;
const MAX_ROOMS = 64;
const COMMAND_BACKLOG = 12;
const REPEAT_TICKS = 3;
const SCENE_CHANGE_COOLDOWN_MS = 1000;
const MESSAGES_PER_SECOND = 150;
const SEND_BUFFER_LIMIT = 1024 * 1024;
const HEARTBEAT_MS = 30_000;
const ROOM_NAME = /^[a-zA-Z0-9_-]{1,32}$/;

interface Client {
  socket: WebSocket;
  id: string;
  slot: number;
  commands: CommandQueue<Command>;
  replicator: Replicator<PublicState>;
}

class Room {
  readonly clients = new Map<WebSocket, Client>();
  readonly session = new Session({ changes: 0 }, (scene) => new DemoSimulation(scene), 'workshop');
  emptySince = Date.now();
  private stop?: () => void;
  private events: Snapshot['events'] = [];
  private lastChange = -Infinity;

  constructor(readonly password: string) {}

  join(socket: WebSocket): Client {
    if (this.clients.size >= MAX_PLAYERS) throw new Error('Room is full');
    const slot = this.freeSlot();
    const client: Client = {
      socket,
      id: `player:${slot}`,
      slot,
      commands: new CommandQueue(COMMAND_BACKLOG, REPEAT_TICKS),
      replicator: new Replicator<PublicState>(),
    };
    this.session.level.join(client.id, slot);
    this.clients.set(socket, client);
    this.stop ??= scheduleTicks(TPS, () => this.tick());
    return client;
  }

  private freeSlot(): number {
    const taken = new Set([...this.clients.values()].map((client) => client.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    return slot;
  }

  welcome(client: Client): ServerMessage {
    const player = this.session.level.players.get(client.id)!;
    return {
      type: 'welcome',
      version: VERSION,
      id: client.id,
      epoch: this.session.epoch,
      position: { ...player.position },
    };
  }

  leave(socket: WebSocket): void {
    const client = this.clients.get(socket);
    if (!client) return;
    this.session.level.leave(client.id);
    this.clients.delete(socket);
    if (this.clients.size) return;
    this.stop?.();
    this.stop = undefined;
    this.emptySince = Date.now();
  }

  change(scene: string): void {
    if (Date.now() - this.lastChange < SCENE_CHANGE_COOLDOWN_MS)
      throw new Error('Wait a moment before changing scenes');
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
    const commands = new Map(
      [...this.clients.values()].map((client) => [client.id, client.commands.take(idle)]),
    );
    level.step(commands);
    const publicState = level.state();
    for (const client of this.clients.values()) {
      send(client.socket, {
        type: 'snapshot',
        epoch: this.session.epoch,
        tick: level.tick,
        scene: level.scene,
        changes: this.session.state.changes,
        ack: client.commands.applied,
        patch: client.replicator.encode(publicState),
        events: this.events,
      });
    }
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
  if (socket.bufferedAmount > SEND_BUFFER_LIMIT) {
    socket.close(1013, 'Client is too slow; reconnect');
    return;
  }
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function listen(port: number, host: string): Promise<Server> {
  const http = createServer();
  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, host, () => {
      http.off('error', reject);
      resolve(http);
    });
  });
}

function rateLimiter(perSecond: number): () => boolean {
  let windowStart = Date.now();
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      count = 0;
      windowStart = now;
    }
    return ++count <= perSecond;
  };
}

export async function startServer(port = 3000, host = '127.0.0.1', roomTtlMs = 600_000) {
  await initPhysics();
  const rooms = new Map<string, Room>();
  const http = await listen(port, host);
  const websocket = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });
  const alive = new Set<WebSocket>();

  function admit(message: JoinMessage): Room {
    if (message.version !== VERSION) throw new Error('Version mismatch; reload');
    if (message.content !== CONTENT) throw new Error('Scene content mismatch; reload');
    if (!ROOM_NAME.test(message.room))
      throw new Error('Use letters, numbers, underscores or hyphens for the room');
    const existing = rooms.get(message.room);
    if (!message.create) {
      if (!existing || existing.password !== message.password)
        throw new Error('Room or password is incorrect');
      return existing;
    }
    if (existing) throw new Error('Room already exists');
    if (rooms.size >= MAX_ROOMS) throw new Error('Server is full');
    const room = new Room(message.password);
    rooms.set(message.room, room);
    return room;
  }

  websocket.on('connection', (socket) => {
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    const allow = rateLimiter(MESSAGES_PER_SECOND);
    let room: Room | undefined;
    let client: Client | undefined;
    socket.on('message', (raw) => {
      if (!allow()) {
        socket.close(1008, 'Message limit exceeded');
        return;
      }
      try {
        const message = parseClientMessage(String(raw));
        if (message.type === 'join') {
          if (client) throw new Error('Already joined');
          room = admit(message);
          client = room.join(socket);
          send(socket, room.welcome(client));
        } else if (!room || !client) {
          throw new Error('Join a room first');
        } else if (message.type === 'command') {
          if (message.epoch === room.session.epoch)
            client.commands.push(message.sequence, message.command);
        } else {
          room.change(message.scene);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Invalid message';
        send(socket, { type: 'error', message: text });
      }
    });
    socket.on('close', () => {
      alive.delete(socket);
      room?.leave(socket);
    });
    socket.on('error', () => socket.close());
  });

  const heartbeat = setInterval(() => {
    for (const socket of websocket.clients) {
      if (alive.delete(socket)) socket.ping();
      else socket.terminate();
    }
  }, HEARTBEAT_MS);
  const sweep = setInterval(
    () => {
      for (const [name, room] of rooms) {
        if (room.clients.size || Date.now() - room.emptySince < roomTtlMs) continue;
        room.dispose();
        rooms.delete(name);
      }
    },
    Math.min(1000, Math.max(10, roomTtlMs / 2)),
  );

  const address = http.address();
  return {
    http,
    rooms,
    port: typeof address === 'object' && address ? address.port : port,
    async close(): Promise<void> {
      clearInterval(heartbeat);
      clearInterval(sweep);
      for (const room of rooms.values()) room.dispose();
      rooms.clear();
      for (const socket of websocket.clients) socket.terminate();
      await new Promise<void>((resolve) => websocket.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
