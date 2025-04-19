import Matter from "matter-js";
import type { GameObject } from "../Gameobject/GameObject";
import { KeyPair } from "./keyPair";
import type { GameController } from "../gameController";
import type { RenderOptions } from "./RenderOptions";
import type { EngineOptions } from "./EngineOptions";
export class PhysicsController {
  private engine: Matter.Engine;
  private render: Matter.Render;
  private runner: Matter.Runner;
  public keyPair: KeyPair<number, string> = new KeyPair();

  constructor(
    html: HTMLElement,
    gameObjects: GameObject[],
    game: GameController,
    engineOptions: EngineOptions,
    renderOptions: RenderOptions
  ) {
    this.engine = Matter.Engine.create(engineOptions);

    this.render = Matter.Render.create({
      element: html,
      engine: this.engine,
      options: renderOptions,
    });

    gameObjects.forEach((obj) => {
      if (!obj.rigidbody) return;
      this.keyPair.addStore(obj.rigidbody.id, obj.id);
      Matter.Composite.add(this.engine.world, obj.rigidbody);
    });

    Matter.Render.run(this.render);

    this.runner = Matter.Runner.create();
    Matter.Runner.run(this.runner, this.engine);

    Matter.Events.on(this.engine, "collisionStart", (event) => {
      const pairs = event.pairs;
      pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        game.gameObjects[this.keyPair.keyA[bodyA.id] as string]?.onCollition(
          this.keyPair.keyA[bodyB.id] as string,
          bodyA,
          bodyB
        );
        game.gameObjects[this.keyPair.keyA[bodyB.id] as string]?.onCollition(
          this.keyPair.keyA[bodyA.id] as string,
          bodyB,
          bodyA
        );
      });
    });
  }

  public addGameObject(obj: GameObject) {
    if (!obj.rigidbody) return;

    this.keyPair.addStore(obj.rigidbody.id, obj.id);
    Matter.Composite.add(this.engine.world, obj.rigidbody);
  }

  public removeGameObject(obj: GameObject) {
    if (!obj.rigidbody) return;
    this.keyPair.removeWithKeyA(obj.rigidbody.id);
    Matter.Composite.remove(this.engine.world, obj.rigidbody);
  }
}
