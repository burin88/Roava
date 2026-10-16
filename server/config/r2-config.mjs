import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

// Only the Node server loads secrets. Existing process environment takes precedence.
try {
  loadEnvFile(resolve(import.meta.dirname, '../../.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

export function readR2Config(env = process.env) {
  const values = {
    accountId: env.CLOUDFLARE_R2_ACCOUNT_ID?.trim(),
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim(),
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim(),
    bucketName: env.CLOUDFLARE_R2_BUCKET_NAME?.trim(),
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value || value.startsWith('YOUR_'))
    .map(([key]) => key);
  if (missing.length) {
    throw Object.assign(new Error(`Cloudflare R2 configuration is missing: ${missing.join(', ')}`), { status: 503 });
  }

  const serviceUrl = env.CLOUDFLARE_R2_SERVICE_URL?.trim()
    || `https://${values.accountId}.r2.cloudflarestorage.com`;
  let endpoint;
  try { endpoint = new URL(serviceUrl); } catch { /* handled below */ }
  if (!endpoint || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password
    || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw Object.assign(new Error('Cloudflare R2 ServiceUrl must be an HTTPS origin'), { status: 503 });
  }

  return Object.freeze({ ...values, serviceUrl: endpoint.origin });
}
