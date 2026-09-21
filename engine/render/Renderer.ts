import type { World } from "@dimforge/rapier2d-compat";
import type { RenderOptions } from "./RenderOptions";

export class Renderer {
  private ctx: CanvasRenderingContext2D;

  constructor(html: HTMLElement, options: RenderOptions) {
    const canvas = Object.assign(document.createElement("canvas"), options);
    this.ctx = html.appendChild(canvas).getContext("2d")!;
  }

  public draw(world: World): void {
    const { vertices, colors } = world.debugRender();
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    for (let i = 0; i < vertices.length; i += 4) {
      const c = i * 2;
      this.ctx.strokeStyle = `rgb(${colors[c]! * 255} ${colors[c + 1]! * 255} ${colors[c + 2]! * 255} / ${colors[c + 3]})`;
      this.ctx.beginPath();
      this.ctx.moveTo(vertices[i]!, vertices[i + 1]!);
      this.ctx.lineTo(vertices[i + 2]!, vertices[i + 3]!);
      this.ctx.stroke();
    }
  }
}
