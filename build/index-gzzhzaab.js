// engine/gameController.ts
class GameController {
  canvas;
  ctx;
  currentScene;
  isRunning = false;
  lastFrameTime = 0;
  constructor(canvas, scene) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.currentScene = scene;
  }
  start() {
    if (this.isRunning)
      return;
    this.isRunning = true;
    console.log("game = start");
    for (const gameObject of this.currentScene.gameObjects) {
      gameObject.start();
    }
    this.lastFrameTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  stop() {
    this.isRunning = false;
  }
  gameLoop(currentTime) {
    if (!this.isRunning)
      return;
    const deltaTime = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;
    for (const gameObject of this.currentScene.gameObjects) {
      gameObject.update();
    }
    requestAnimationFrame(this.gameLoop.bind(this));
  }
}

// game/scenes/testScene.ts
var testScene = {
  gameObjects: []
};

// main.ts
var canvas = document.getElementById("canvas");
var game = new GameController(canvas, testScene);
game.start();
