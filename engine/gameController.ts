import { v7 as uuidv7 } from "uuid";
import type { GameObject } from "./Gameobject/GameObject";
import { PhysicsController } from "./physics/physicsController";
import type { Position, Scene } from "./interfaces/Scene";
import { InputController } from "./inputController";
import type { EngineOptions } from "./physics/EngineOptions";
import { defaultEngineOptions } from "./physics/EngineOptions";
import { defaultRenderOptions } from "./physics/RenderOptions";
import type { RenderOptions } from "./physics/RenderOptions";

export class GameController {
  private html: HTMLElement;
  private currentScene: Scene;
  private isRunning: boolean = false;
  public engineOptions: EngineOptions;
  public renderOptions: RenderOptions;
  public lastFrameTime: number = 0;
  public deltaTime: number = 0;
  public gameObjects: { [uuid: string]: GameObject } = {};

  private physicsController: PhysicsController | null = null;
  public inputController: InputController;

  constructor(
    html: HTMLElement,
    scene: Scene,
    engineOptions?: EngineOptions,
    renderOptions?: RenderOptions
  ) {
    this.html = html;
    this.currentScene = scene;
    this.inputController = new InputController();
    this.engineOptions = engineOptions ?? defaultEngineOptions;
    this.renderOptions = renderOptions ?? defaultRenderOptions;

    // Initialize all game objects
    for (const gameObject of this.currentScene.gameObjects) {
      const uuid = uuidv7();
      const instance = Array.isArray(gameObject)
        ? new gameObject[0](uuid, this, gameObject[1])
        : new gameObject(uuid, this);

      this.gameObjects[uuid] = instance;
    }
  }

  public start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    this.physicsController = new PhysicsController(
      this.html,
      Object.values(this.gameObjects),
      this,
      this.engineOptions,
      this.renderOptions
    );

    for (const uuid in this.gameObjects) {
      this.gameObjects[uuid]!.start();
    }

    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  public stop(): void {
    this.isRunning = false;
  }

  private gameLoop(currentTime: number): void {
    if (!this.isRunning) return;

    this.deltaTime = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    this.inputController.updateInputState();

    for (const uuid in this.gameObjects) {
      this.gameObjects[uuid]!.update();
    }

    requestAnimationFrame(this.gameLoop.bind(this));
  }

  public destroyGameobject(gameObject: GameObject): void {
    const id = gameObject.id;
    if (this.gameObjects[id]) {
      this.gameObjects[id]!.onDestroy();
      this.physicsController?.removeGameObject(this.gameObjects[id]!);
      delete this.gameObjects[id];
    }
  }

  public instantiateGameObject(
    gameObject: typeof GameObject,
    position?: Position
  ): GameObject {
    // Create a new instance of the GameObject
    const instance = new gameObject(uuidv7(), this, position);

    // Add it to our gameObjects map
    this.gameObjects[instance.id] = instance;

    // Add it to physics world if needed
    this.physicsController?.addGameObject(instance);

    // Call start method
    instance.start();

    return instance;
  }
}
