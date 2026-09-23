// The room server: one Session per room, a tick loop while it has players, a snapshot per tick.
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Models } from '../src/assets.js';
import { CommandQueue, Replicator, Session, scheduleTicks } from '../src/index.js';
import { initPhysics } from '../src/physics.js';
import { DemoSimulation } from './simulation.js';
import { modelNames, modelUrl } from './scene.js';
import { TPS, idle, type Command } from './movement.js';
import {
  parseClientMessage,
  CONTENT,
  VERSION,
  type ClientMessage,
  type JoinMessage,
  type PublicState,
  type ServerMessage,
  type Snapshot,
} from './protocol.js';

const MAX_PLAYERS = 8;
const MAX_ROOMS = 64;
const COMMAND_BACKLOG = 12; // queued commands per client before the oldest are dropped
const REPEAT_TICKS = 3; // ticks a late client's last command is repeated before it counts as idle
const SCENE_CHANGE_COOLDOWN_MS = 1000;
const MESSAGES_PER_SECOND = 150;
const SEND_BUFFER_LIMIT = 1024 * 1024; // bytes queued to a socket before its client is too slow
const HEARTBEAT_MS = 30_000;
const ROOM_NAME = /^[a-zA-Z0-9_-]{1,32}$/;

// The server reads model files from disk; the browser gives the same class a fetch instead.
const models = new Models((name) => readFile(modelUrl(name)));

interface Client {
  socket: WebSocket;
  id: string;
  slot: number;
  commands: CommandQueue<Command>; // buffers this client's numbered commands until a tick takes one
  replicator: Replicator<PublicState>; // knows what this client last saw, to send only changes
}

class Room {
  readonly clients = new Map<WebSocket, Client>();
  // Session owns the current DemoSimulation plus the state that survives scene changes.
  readonly session = new Session(
    { changes: 0 },
    (scene) => new DemoSimulation(scene, models),
    'workshop',
  );
  emptySince = Date.now();
  private stop?: () => void;
  private events: Snapshot['events'] = []; // announcements to include in the next snapshot
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
    // The first player starts the tick loop; leave() stops it again when the room empties.
    this.stop ??= scheduleTicks(TPS, () => this.tick());
    return client;
  }

  // Slots are reused, so player ids stay short and spawn positions stay close together.
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

  // Builds the new level, bumps the epoch and re-adds every player to it.
  change(scene: string): void {
    if (Date.now() - this.lastChange < SCENE_CHANGE_COOLDOWN_MS)
      throw new Error('Wait a moment before changing scenes');
    this.lastChange = Date.now();
    this.session.change(scene);
    this.session.state.changes++;
    for (const client of this.clients.values()) {
      client.commands.clear(); // input meant for the old scene must not run in the new one
      client.replicator.reset(); // the next snapshot carries the full state instead of a patch
      this.session.level.join(client.id, client.slot);
    }
    this.events.push({ type: 'scene', scene });
  }

  // One authoritative tick: take one command per client, step, then send each client its own patch.
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
        ack: client.commands.applied, // lets the client drop predictions the server has confirmed
        patch: client.replicator.encode(publicState), // only what changed for this client
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
  await Promise.all([initPhysics(), models.load(modelNames)]);
  const rooms = new Map<string, Room>();
  const http = await listen(port, host);
  const websocket = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });
  const alive = new Set<WebSocket>();

  // Decides which room a join leads to, creating it when asked.
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
      let message: ClientMessage | undefined;
      try {
        message = parseClientMessage(String(raw));
        if (message.type === 'join') {
          if (client) throw new Error('Already joined');
          room = admit(message);
          client = room.join(socket);
          send(socket, room.welcome(client));
        } else if (!room || !client) {
          throw new Error('Join a room first');
        } else if (message.type === 'command') {
          // Commands sent before a scene change carry the old epoch and are dropped.
          if (message.epoch === room.session.epoch)
            client.commands.push(message.sequence, message.command);
        } else {
          room.change(message.scene);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Invalid message';
        send(socket, { type: 'error', message: text });
        // The queue is full, so this client ran far ahead; close instead of losing input silently.
        if (message?.type === 'command') socket.close(1008, text);
      }
    });
    socket.on('close', () => {
      alive.delete(socket);
      room?.leave(socket);
    });
    socket.on('error', () => socket.close());
  });

  // Pings idle sockets and drops those that did not answer the previous ping.
  const heartbeat = setInterval(() => {
    for (const socket of websocket.clients) {
      if (alive.delete(socket)) socket.ping();
      else socket.terminate();
    }
  }, HEARTBEAT_MS);
  // Frees rooms that have stayed empty for longer than the TTL.
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
