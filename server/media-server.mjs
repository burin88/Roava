import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { handleNodeStorageApi } from './node-storage-api.mjs';
import { getR2StorageService } from './services/r2-storage.service.mjs';

export async function startMediaServer(port = Number(process.env.MEDIA_PORT || 4300), storageFactory = getR2StorageService, apiOptions) {
  const server = createServer(async (request, response) => {
    try {
      if (await handleNodeStorageApi(request, response, storageFactory, apiOptions)) return;
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
    } catch {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Media API request failed' }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  console.log(`R2 media API ready at http://127.0.0.1:${server.address().port}`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await startMediaServer();
