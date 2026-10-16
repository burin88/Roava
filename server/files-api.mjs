import { handleNodeStorageApi } from './node-storage-api.mjs';
import { getR2StorageService } from './services/r2-storage.service.mjs';
export { maximumUploadSize } from './storage-api.mjs';

export async function handleFilesApi(request, response, storageFactory = getR2StorageService) {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (path !== '/api/files' && !path.startsWith('/api/files/')) return false;
  return handleNodeStorageApi(request, response, storageFactory);
}
