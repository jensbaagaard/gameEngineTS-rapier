class Debugger {
  public debugMode = true;
  public log(log: any) {
    if (!this.debugMode) return;
    console.log(log);
  }
}
const Debug = new Debugger();
export default Debug;
