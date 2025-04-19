import Matter from "matter-js";
export interface RenderOptions extends Matter.IRendererOptions {}

export const defaultRenderOptions: RenderOptions = {
  width: 800,
  height: 600,
  wireframes: false,
};
