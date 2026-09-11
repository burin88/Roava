import { spawn } from 'node:child_process';
import { startMediaServer } from './media-server.mjs';

const mediaServer = await startMediaServer();
const angular = spawn(
  process.execPath,
  ['./node_modules/@angular/cli/bin/ng.js', 'serve', ...process.argv.slice(2)],
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

