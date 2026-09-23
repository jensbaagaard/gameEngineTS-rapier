export class CommandQueue<C> {
  private queue: { sequence: number; command: C }[] = [];
  private received = 0;
  private repeated = 0;
  private last: C | undefined;
  applied = 0;

  constructor(
    readonly capacity: number,
    readonly repeatTicks: number,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw new Error('Invalid command queue configuration');
    if (!Number.isSafeInteger(repeatTicks) || repeatTicks < 0)
      throw new Error('Invalid command queue configuration');
  }

  push(sequence: number, command: C): boolean {
    if (!Number.isSafeInteger(sequence) || sequence <= this.received) return false;
    if (this.queue.length >= this.capacity)
      throw new Error('Command backlog exceeded; reconnect to synchronize');
    this.received = sequence;
    this.queue.push({ sequence, command: structuredClone(command) });
    return true;
  }

  take(idle: (last: C | undefined) => C): C {
    const next = this.queue.shift();
    if (next) {
      this.applied = next.sequence;
      this.last = next.command;
      this.repeated = 0;
      return structuredClone(next.command);
    }
    if (this.last === undefined || this.repeated >= this.repeatTicks) return idle(this.last);
    this.repeated++;
    return structuredClone(this.last);
  }

  get length(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
    this.last = undefined;
    this.repeated = 0;
  }
}

export interface TickMessage {
  epoch: number;
  tick: number;
}

export class TickInbox<T extends TickMessage> {
  private queue: T[] = [];
  private epoch = -1;
  private tick = -1;

  constructor(readonly capacity = 600) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Invalid inbox capacity');
  }

  push(message: T): boolean {
    if (!Number.isSafeInteger(message.epoch) || message.epoch < 0)
      throw new Error('Invalid message clock');
    if (!Number.isSafeInteger(message.tick) || message.tick < 0)
      throw new Error('Invalid message clock');
    if (this.isStale(message)) return false;
    if (this.queue.length >= this.capacity)
      throw new Error('Snapshot backlog exceeded; reconnect to synchronize');
    this.epoch = message.epoch;
    this.tick = message.tick;
    this.queue.push(message);
    return true;
  }

  private isStale(message: T): boolean {
    if (message.epoch !== this.epoch) return message.epoch < this.epoch;
    return message.tick <= this.tick;
  }

  get length(): number {
    return this.queue.length;
  }

  drain(): T[] {
    const result = this.queue;
    this.queue = [];
    return result;
  }

  clear(): void {
    this.queue = [];
    this.epoch = -1;
    this.tick = -1;
  }
}
