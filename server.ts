import { createServer as createViteServer } from 'vite';
import { startServer } from './game/server.js';

const server = await startServer(Number(process.env.PORT ?? 3000), process.env.HOST ?? '127.0.0.1');
const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server: server.http } }, appType: 'spa' }).catch(async error => { await server.close(); throw error; });
server.http.on('request', vite.middlewares);
process.stdout.write(`Engine demo: http://127.0.0.1:${server.port}\n`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await vite.close();
  await server.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
