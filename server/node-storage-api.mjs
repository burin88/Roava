import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { handleAuthenticatedApi } from './authenticated-api.mjs';

export async function handleNodeStorageApi(request, response, storageFactory, { env, fetcher } = {}) {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (!/^\/api\/(files|media|config|requirements|requirement-prs|masters)(\/|$)/.test(pathname)) return false;
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const webRequest = new Request(new URL(request.url, 'http://localhost'), {
    method: request.method, headers: request.headers,
    ...(hasBody ? { body: Readable.toWeb(request), duplex: 'half' } : {}),
  });
  const result = await handleAuthenticatedApi(webRequest, storageFactory, env, fetcher);
  if (!request.complete) request.resume();
  response.writeHead(result.status, Object.fromEntries(result.headers));
  if (result.body) await pipeline(Readable.fromWeb(result.body), response);
  else response.end();
  return true;
}
