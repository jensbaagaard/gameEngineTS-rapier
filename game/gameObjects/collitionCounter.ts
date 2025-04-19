import { GameObject } from "../../engine/Gameobject/GameObject";

export class collitionCounter extends GameObject{
    public tag: string = "counter"
    public collitionCount:number = 0;

    public count() {
        this.collitionCount++;
    }
}