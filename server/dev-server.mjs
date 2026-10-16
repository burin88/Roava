import { spawn } from 'node:child_process';
import { startMediaServer } from './media-server.mjs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

let mediaServer;
try { mediaServer = await startMediaServer(); }
catch (error) {
  if (error.code !== 'EADDRINUSE') throw error;
  console.log('Media port is occupied; using an available port for this development session.');
  mediaServer = await startMediaServer(0);
}
// Bind this Angular session to the API we just started, never to a stale process.
await mkdir(resolve('tmp'), { recursive: true });
const proxyDirectory = await mkdtemp(join(resolve('tmp'), 'roava-dev-'));
const proxyPath = join(proxyDirectory, 'proxy.json');
await writeFile(proxyPath, JSON.stringify({ '/api': {
  target: `http://127.0.0.1:${mediaServer.address().port}`, secure: false, changeOrigin: true,
} }));
const angular = spawn(
  process.execPath,
  ['./node_modules/@angular/cli/bin/ng.js', 'serve', '--proxy-config', proxyPath, ...process.argv.slice(2)],
  { cwd: process.cwd(), stdio: 'inherit', shell: false },
);

let closing = false;
const close = (exitCode = 0) => {
  if (closing) return;
  closing = true;
  if (!angular.killed) angular.kill();
  mediaServer.close(() => process.exit(exitCode));
};

angular.on('error', (error) => {
  console.error('Unable to start Angular dev server:', error);
  close(1);
});
angular.on('exit', (code) => close(code ?? 0));
process.on('SIGINT', () => close());
process.on('SIGTERM', () => close());

