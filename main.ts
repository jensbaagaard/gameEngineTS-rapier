import { Client } from "./engine/Client";
import { connectLocal, connectRemote, relay } from "./engine/net";
import { Renderer } from "./engine/render/Renderer";
import { testView } from "./game/views/testView";

const mode = new URLSearchParams(location.search);
const wsUrl = `${location.origin.replace(/^http/, "ws")}/ws`;
const client = new Client(new Renderer(document.body, testView));

if (mode.has("local") || mode.has("host")) {
  const { Simulation } = await import("./engine/Simulation");
  const { testScene } = await import("./game/scenes/testScene");
  const sim = new Simulation(testScene);
  sim.start();
  connectLocal(sim, client);
  if (mode.has("host")) relay(sim, `${wsUrl}?host`);
} else connectRemote(client, wsUrl);
