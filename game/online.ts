import {
  FixedClock,
  Prediction,
  Replica,
  SnapshotBuffer,
  TickInbox,
  type Vector,
} from '../src/index.js';
import { TPS, move, type Command } from './movement.js';
import {
  CONTENT,
  VERSION,
  type ClientMessage,
  type Pose,
  type PublicState,
  type ServerMessage,
  type Snapshot,
  type Welcome,
} from './protocol.js';
import type { DemoView } from './view.js';

const RENDER_DELAY_TICKS = 2;
const RESYNC_THRESHOLD_TICKS = 8;
const RENDER_DRIFT_MS = 500;
const CORRECTION_DECAY_MS = 80;
const CORRECTION_SNAP_DISTANCE = 3;

export interface OnlineEvents {
  status(text: string): void;
  inRoom(value: boolean): void;
}

export class OnlineClient {
  private socket?: WebSocket;
  private readonly clock = new FixedClock(1000 / TPS);
  private readonly inbox = new TickInbox<Snapshot>();
  private readonly history = new SnapshotBuffer<PublicState>();
  private replica = new Replica<PublicState>();
  private prediction?: Prediction<Vector, Command>;
  private playerId = 'player:0';
  private epoch = 0;
  private renderTick = -1;
  private correction: Vector = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly view: DemoView,
    private readonly events: OnlineEvents,
  ) {}

  get state(): PublicState {
    return this.replica.state;
  }

  join(room: string, password: string, create: boolean): void {
    if (this.socket) return;
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws`);
    this.socket = socket;
    this.events.status('Connecting…');
    socket.onopen = () =>
      this.send({ type: 'join', version: VERSION, content: CONTENT, room, password, create });
    socket.onmessage = (event) => {
      if (this.socket === socket) this.handleMessage(String(event.data));
    };
    socket.onclose = (event) => {
      if (this.socket === socket)
        this.disconnect(event.reason || 'Disconnected · join again to synchronize');
    };
    socket.onerror = () => {
      if (this.socket === socket) this.disconnect('Could not connect');
    };
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as ServerMessage;
      if (message.type === 'error') this.handleError(message.message);
      else if (message.type === 'welcome') this.handleWelcome(message);
      else if (message.type === 'snapshot') this.inbox.push(message);
      else throw new Error('Unknown server message');
    } catch (error) {
      this.disconnect(error instanceof Error ? error.message : 'Connection failed');
    }
  }

  private handleError(message: string): void {
    this.events.status(message);
    if (!this.prediction) this.disconnect(message);
  }

  private handleWelcome(message: Welcome): void {
    if (message.version !== VERSION) throw new Error('Version mismatch; reload');
    this.playerId = message.id;
    this.epoch = message.epoch;
    this.inbox.clear();
    this.history.clear();
    this.replica = new Replica<PublicState>();
    this.renderTick = -1;
    this.prediction = new Prediction(message.position, move);
    this.events.inRoom(true);
    this.events.status(`Online · ${this.playerId} · WASD to move`);
  }

  private disconnect(message: string): void {
    this.socket?.close();
    this.socket = undefined;
    this.prediction = undefined;
    this.events.status(message);
    this.events.inRoom(false);
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  change(scene: string): void {
    if (this.prediction) this.send({ type: 'scene', scene });
  }

  frame(elapsedMs: number, readInput: () => Command): void {
    try {
      this.applySnapshots();
      this.clock.advance(elapsedMs, () => this.command(readInput()));
      this.draw(elapsedMs);
    } catch (error) {
      this.disconnect(error instanceof Error ? error.message : 'Simulation failed');
    }
  }

  private command(input: Command): void {
    if (!this.prediction || this.socket?.readyState !== WebSocket.OPEN) return;
    const sequence = this.prediction.push(input);
    this.send({ type: 'command', epoch: this.epoch, sequence, command: input });
  }

  private applySnapshots(): void {
    for (const snapshot of this.inbox.drain()) {
      const newEpoch = this.epoch !== snapshot.epoch;
      this.replica.apply(snapshot.patch);
      const me = this.replica.state[this.playerId];
      if (newEpoch || this.view.currentScene !== snapshot.scene) this.travel(snapshot, me);
      if (this.prediction && me)
        this.reconcile(this.prediction, me.position, snapshot.ack, newEpoch);
      this.history.push(snapshot.tick, this.replica.state);
      for (const event of snapshot.events) {
        this.events.status(`${event.scene} · ${snapshot.changes} scene changes · ${this.playerId}`);
      }
    }
  }

  private travel(snapshot: Snapshot, me: Pose | undefined): void {
    this.epoch = snapshot.epoch;
    this.view.load(snapshot.scene);
    this.history.clear();
    this.renderTick = -1;
    this.correction = { x: 0, y: 0, z: 0 };
    if (me) this.prediction?.reset({ ...me.position });
  }

  private reconcile(
    prediction: Prediction<Vector, Command>,
    authoritative: Vector,
    ack: number,
    newEpoch: boolean,
  ): void {
    const before = { ...prediction.state };
    prediction.correct(authoritative, ack);
    const dx = before.x - prediction.state.x;
    const dz = before.z - prediction.state.z;
    if (newEpoch || Math.hypot(dx, dz) >= CORRECTION_SNAP_DISTANCE) {
      this.correction = { x: 0, y: 0, z: 0 };
      return;
    }
    this.correction.x += dx;
    this.correction.z += dz;
  }

  private draw(elapsedMs: number): void {
    if (this.history.newestTick < 0) {
      this.view.render();
      return;
    }
    this.advanceRenderTick(elapsedMs);
    const sample = this.history.sample(this.renderTick)!;
    const decay = Math.exp(-elapsedMs / CORRECTION_DECAY_MS);
    this.correction.x *= decay;
    this.correction.z *= decay;
    const predicted = this.prediction
      ? {
          x: this.prediction.state.x + this.correction.x,
          y: this.prediction.state.y,
          z: this.prediction.state.z + this.correction.z,
        }
      : undefined;
    this.view.draw(sample.from, sample.to, sample.alpha, this.playerId, predicted);
  }

  private advanceRenderTick(elapsedMs: number): void {
    const target = this.history.newestTick - RENDER_DELAY_TICKS;
    if (this.renderTick < 0 || Math.abs(target - this.renderTick) > RESYNC_THRESHOLD_TICKS) {
      this.renderTick = target;
      return;
    }
    this.renderTick += (elapsedMs / 1000) * TPS;
    this.renderTick += (target - this.renderTick) * (1 - Math.exp(-elapsedMs / RENDER_DRIFT_MS));
  }

  dispose(): void {
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }
}
