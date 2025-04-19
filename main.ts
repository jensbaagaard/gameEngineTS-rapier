import { GameController } from "./engine/gameController";
import { testScene } from "./game/scenes/testScene";

const html = document.getElementById("gameView") as unknown as HTMLElement;

const game = new GameController(html, testScene);

game.start();
