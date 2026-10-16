export const testOwner = '11111111-1111-4111-8111-111111111111';
export const testEnv = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  CLOUDFLARE_R2_BUCKET_NAME: 'test-bucket', R2_LEGACY_OWNER_ID: testOwner };
export const testAuth = { token: async () => 'test-token' };
export const realFetch = globalThis.fetch;
export function fetchWithAuth(url, options = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('authorization')) headers.set('authorization', 'Bearer test-token');
  return realFetch(url, { ...options, headers });
}
export function supabaseFixture() {
  const attachments = new Map();
  const fetcher = async (url, options = {}) => {
    const u = new URL(url);
    const token = new Headers(options.headers).get('authorization');
    if (u.pathname === '/auth/v1/user') return Response.json(token === 'Bearer test-token' ? { id: testOwner } : {}, { status: token === 'Bearer test-token' ? 200 : 401 });
    if (u.pathname.endsWith('/profiles')) return new Response(null, { status: 201 });
    if (u.pathname.endsWith('/attachments')) {
      if (options.method === 'POST') {
        const row = JSON.parse(options.body); attachments.set(row.id, row);
        return new Response(null, { status: 201 });
      }
      const id = u.searchParams.get('id')?.replace(/^eq\./, '');
      if (options.method === 'PATCH') {
        Object.assign(attachments.get(id), JSON.parse(options.body));
        return new Response(null, { status: 204 });
      }
      return Response.json(attachments.has(id) ? [attachments.get(id)] : []);
    }
    throw new Error(`Unexpected fixture URL: ${url}`);
  };
  return { env: testEnv, fetcher, attachments };
}
