import type Matter from "matter-js";
import type { GameController } from "../gameController";
import type { Position } from "../interfaces/Scene";
import type { Body } from "matter-js";

export class GameObject {
  public id: string;
  public tag: string = "not set";
  public game: GameController;
  public startPosition: Position;
  public rigidbody?: Matter.Body;

  public setGame(game: GameController): void {
    this.game = game;
  }
  public start(): void {}
  public update(): void {}
  public onDestroy(): void {}
  public onCollition(
    targetId: string,
    rigidbody: Body,
    targetRigidBody: Body
  ): void {}

  public destroy(gameObject: GameObject): void {
    this.game.destroyGameobject(gameObject);
  }

  /**
   * Check if **all** requested input keys are pressed (currently active).
   */
  public getInput(input: string[]): boolean {
    // with a Record, check presence like: !!this.game.pressedKeys[key]
    return input.every((key) => !!this.game.inputController.pressedKeys[key]);
  }

  /**
   * Check if **all** requested keys were pressed **this frame**.
   */
  public getKeyDown(input: string[]): boolean {
    return input.every(
      (key) => !!this.game.inputController.keysDownThisFrame[key]
    );
  }

  /**
   * Check if **all** requested keys were released **this frame**.
   */
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
