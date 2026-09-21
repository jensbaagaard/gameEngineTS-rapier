import type {
  ColliderDesc,
  RigidBody,
  RigidBodyDesc,
} from "@dimforge/rapier2d-compat";
import type { GameController } from "../gameController";
import type { Position } from "../interfaces/Scene";

export class GameObject {
  public id: string;
  public tag: string = "not set";
  public game: GameController;
  public startPosition: Position;
  public body?: RigidBodyDesc;
  public collider?: ColliderDesc;
  public rigidbody?: RigidBody;

  public setGame(game: GameController): void {
    this.game = game;
  }
  public start(): void {}
  public update(): void {}
  public onDestroy(): void {}
  public onCollition(target: GameObject): void {}

  public destroy(gameObject: GameObject): void {
    this.game.destroyGameobject(gameObject);
  }

  public getInput(input: string[]): boolean {
    return input.every((key) => !!this.game.inputController.pressedKeys[key]);
  }

  public getKeyDown(input: string[]): boolean {
    return input.every(
      (key) => !!this.game.inputController.keysDownThisFrame[key]
    );
  }

  public getKeyUp(input: string[]): boolean {
    return input.every(
      (key) => !!this.game.inputController.keysUpThisFrame[key]
    );
  }

  public getComponentById(id: string): GameObject | undefined {
    return this.game.gameObjects[id];
  }

  public getComponentByTag<T extends GameObject>(tag: string): T[] {
    return Object.values(this.game.gameObjects).filter(
      (gameObject) => gameObject.tag === tag
    ) as T[];
  }

  constructor(id: string, gameController: GameController, position?: Position) {
    this.id = id;
    this.game = gameController;
    this.startPosition = position || { x: 0, y: 0 };
  }
}
