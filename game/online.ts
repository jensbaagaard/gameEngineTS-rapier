// Online mode: the server simulates. This client sends input, predicts its own player so it feels
// immediate, and draws everyone else a little behind the newest snapshot so they move smoothly.
import {
  FixedClock,
  Prediction,
  RenderClock,
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

const CORRECTION_DECAY_MS = 80; // how quickly a server correction fades out of view
const CORRECTION_SNAP_DISTANCE = 3; // larger corrections, in meters, snap instead of fading

export interface OnlineEvents {
  status(text: string): void;
  inRoom(value: boolean): void;
}

export class OnlineClient {
  private socket?: WebSocket;
  private readonly clock = new FixedClock(1000 / TPS); // paces commands at exactly TPS
  private readonly inbox = new TickInbox<Snapshot>(); // arriving snapshots, stale ones dropped
  private readonly history = new SnapshotBuffer<PublicState>(); // recent states to draw between
  private replica = new Replica<PublicState>(); // rebuilds the full state from the server's patches
  private prediction?: Prediction<Vector, Command>; // my own position, run ahead of the server
  private playerId = 'player:0';
  private epoch = 0; // the server's scene generation, bumped on every scene change
  private readonly renderClock = new RenderClock(TPS); // the tick being drawn, behind the newest
  private correction: Vector = { x: 0, y: 0, z: 0 }; // visual offset that hides the last correction

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
    // Handlers check the socket is still current, so a stale connection cannot interfere.
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

  // Errors before joining end the attempt; errors inside a room are only shown.
  private handleError(message: string): void {
    this.events.status(message);
    if (!this.prediction) this.disconnect(message);
  }

  // Prediction starts where the server placed us and uses the same move() the server runs.
  private handleWelcome(message: Welcome): void {
    if (message.version !== VERSION) throw new Error('Version mismatch; reload');
    this.playerId = message.id;
    this.epoch = message.epoch;
    this.inbox.clear();
    this.history.clear();
    this.replica = new Replica<PublicState>();
    this.renderClock.reset();
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

  // Called once per animation frame: apply what arrived, send input at TPS, then draw.
  frame(elapsedMs: number, readInput: () => Command): void {
    try {
      this.applySnapshots();
      this.clock.advance(elapsedMs, () => this.command(readInput()));
      this.draw(elapsedMs);
    } catch (error) {
      this.disconnect(error instanceof Error ? error.message : 'Simulation failed');
    }
  }

  // Predicts the input locally right away and sends it numbered, so the server can acknowledge it.
  private command(input: Command): void {
    if (!this.prediction || this.socket?.readyState !== WebSocket.OPEN) return;
    const sequence = this.prediction.push(input);
    this.send({ type: 'command', epoch: this.epoch, sequence, command: input });
  }

  // Applies every snapshot that arrived since the last frame, in tick order.
  private applySnapshots(): void {
    for (const snapshot of this.inbox.drain()) {
      const newEpoch = this.epoch !== snapshot.epoch;
      this.replica.apply(snapshot.patch);
      const me = this.replica.state[this.playerId];
      // A new epoch or scene name means the room changed scene: reload visuals, restart drawing.
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
    this.renderClock.reset();
    this.correction = { x: 0, y: 0, z: 0 };
    if (me) this.prediction?.reset({ ...me.position });
  }

  // Rewinds the prediction to the server's position and replays commands it has not applied yet.
  // The jump this would cause on screen is stored so draw() can fade it out instead of popping.
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
      this.view.render(); // nothing received yet: show the empty scene
      return;
    }
    const renderTick = this.renderClock.advance(elapsedMs, this.history.newestTick);
    const sample = this.history.sample(renderTick)!;
    // Fade the correction a little every frame.
    const decay = Math.exp(-elapsedMs / CORRECTION_DECAY_MS);
    this.correction.x *= decay;
    this.correction.z *= decay;
    this.view.draw(sample.from, sample.to, sample.alpha, this.playerId, this.predictedPosition());
  }

  // Where my player is drawn: the prediction plus the fading correction. Undefined before joining.
  private predictedPosition(): Vector | undefined {
    if (!this.prediction) return;
    return {
      x: this.prediction.state.x + this.correction.x,
      y: this.prediction.state.y,
      z: this.prediction.state.z + this.correction.z,
    };
  }

  dispose(): void {
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }
}
