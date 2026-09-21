import type { ClientMessage, ServerMessage } from "./interfaces/Protocol";
import type { Renderer } from "./render/Renderer";

export class Client {
  public playerId?: string;
  public send: (msg: ClientMessage) => void = () => {};

  constructor(private renderer: Renderer) {
    window.addEventListener("keydown", (e) => this.onKey(e, true));
    window.addEventListener("keyup", (e) => this.onKey(e, false));
  }

  public receive = (msg: ServerMessage): void => {
    if (msg.type === "welcome") this.playerId = msg.playerId;
    else this.renderer.draw(msg.objects, this.playerId);
  };

  private onKey(e: KeyboardEvent, down: boolean): void {
    e.preventDefault();
    if (!e.repeat) this.send({ type: "key", key: e.key, down });
  }
}
