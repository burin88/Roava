/** Public delivery domains are separate from the authenticated R2 S3 endpoint. */
export function r2PublicObjectUrl(baseUrl, key) {
  if (!baseUrl?.trim()) return null;
  let base;
  try { base = new URL(baseUrl.trim()); } catch { throw Object.assign(new Error('Invalid R2_PUBLIC_BASE_URL'), { status: 503 }); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
    || base.hostname.endsWith('.r2.cloudflarestorage.com') || base.hostname === 'r2.cloudflarestorage.com') {
    throw Object.assign(new Error('R2_PUBLIC_BASE_URL must be an HTTPS public delivery URL, not the R2 S3 endpoint'), { status: 503 });
  }
  if (!key || key.split('/').some(segment => segment === '.' || segment === '..')) {
    throw Object.assign(new Error('Invalid R2 object key'), { status: 400 });
  }
  return `${base.href.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
