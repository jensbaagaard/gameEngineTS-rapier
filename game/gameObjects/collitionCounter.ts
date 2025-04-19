import Debug from "../../engine/Debug/Debug";
import { GameObject } from "../../engine/Gameobject/GameObject";

export class CollitionCounter extends GameObject {
  public tag: string = "counter";
  public collitionCount: number = 0;

  public count() {
    this.collitionCount++;
    Debug.log(this.collitionCount);
  }
}
