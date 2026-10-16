// Only these public values may be exposed to the browser. Never serialize process.env.
export function publicSupabaseConfig(env = process.env) {
  const url = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey || url.includes('YOUR_') || publishableKey.includes('YOUR_')) {
    throw Object.assign(new Error('กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_PUBLISHABLE_KEY ใน .env'), { status: 503 });
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw Object.assign(new Error('SUPABASE_URL must be an HTTPS origin'), { status: 503 });
  }
  if (!publishableKey.startsWith('sb_publishable_')) {
    // Support legacy anon JWTs only; reject service_role and opaque secret keys.
    let role;
    try { role = JSON.parse(atob(publishableKey.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).role; } catch {}
    if (role !== 'anon') throw Object.assign(new Error('Use a publishable or anon key, never a secret/service_role key'), { status: 503 });
  }
  return { url: parsed.origin, publishableKey };
}
