import type { Client } from "./Client";
import type { Simulation } from "./Simulation";

export function connectLocal(sim: Simulation, client: Client): void {
  const playerId = "local";
  client.playerId = playerId;
  client.send = (msg) => sim.handle({ ...msg, playerId });
  sim.subscribe(client.receive);
  sim.handle({ type: "join", playerId });
}

export function connectRemote(client: Client, url: string): void {
  const ws = open(url);
  ws.onopen = () => (client.send = (msg) => ws.send(JSON.stringify(msg)));
  ws.onmessage = (e) => client.receive(JSON.parse(e.data));
}

export function relay(sim: Simulation, url: string): void {
  const ws = open(url);
  ws.onopen = () =>
    sim.subscribe((snapshot) => ws.send(JSON.stringify(snapshot)));
  ws.onmessage = (e) => sim.handle(JSON.parse(e.data));
}

function open(url: string): WebSocket {
  const ws = new WebSocket(url);
  window.addEventListener("pagehide", () => ws.close());
  return ws;
}
