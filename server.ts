import type { ServerWebSocket } from "bun";
import { Simulation } from "./engine/Simulation";
import type { ServerMessage, SimMessage } from "./engine/interfaces/Protocol";
import { testScene } from "./game/scenes/testScene";
import index from "./index.html";

type Socket = ServerWebSocket<{ playerId?: string }>;

const isRelay = Bun.argv.includes("--relay");
const sim = isRelay ? undefined : new Simulation(testScene);
let host: Socket | undefined;

const toSim = (msg: SimMessage) =>
  sim ? sim.handle(msg) : host?.send(JSON.stringify(msg));

const server = Bun.serve({
  routes: {
    "/": index,
    "/ws": (req, server) => {
      const isHost = isRelay && new URL(req.url).searchParams.has("host");
      const data = { playerId: isHost ? undefined : crypto.randomUUID() };
      if (server.upgrade(req, { data })) return;
      return new Response("Expected WebSocket", { status: 400 });
    },
  },
  websocket: {
    open(ws: Socket) {
      const { playerId } = ws.data;
      if (!playerId) {
        if (host) ws.close(1013, "Host already connected");
        else host = ws;
      } else if (!sim && !host) ws.close(1013, "No host connected");
      else {
        ws.subscribe("players");
        const welcome = { type: "welcome", playerId } satisfies ServerMessage;
        ws.send(JSON.stringify(welcome));
        toSim({ type: "join", playerId });
      }
    },
    message(ws: Socket, raw) {
      const { playerId } = ws.data;
      if (playerId) toSim({ ...JSON.parse(String(raw)), playerId });
      else server.publish("players", raw);
    },
    close(ws: Socket) {
      const { playerId } = ws.data;
      if (playerId) toSim({ type: "leave", playerId });
      else if (host === ws) host = undefined;
    },
  },
});

sim?.subscribe((snapshot) =>
  server.publish("players", JSON.stringify(snapshot))
);
sim?.start();
console.log(`${isRelay ? "Relay" : "Dedicated"} server on ${server.url}`);
