import { handleAuthenticatedApi } from '../../server/authenticated-api.mjs';
import { R2BindingStorageService } from '../../server/services/r2-binding-storage.service.mjs';

export function onRequest({ request, env }) {
  return handleAuthenticatedApi(request, () => new R2BindingStorageService(env.R2_STORAGE), env);
}
