import Matter from "matter-js";
export interface EngineOptions extends Matter.IEngineDefinition {}

export const defaultEngineOptions: EngineOptions = {
  gravity: { x: 0, y: 1 },
};
