const masters = { 'requirement-types': 'master_requirement_type', 'requirement-priorities': 'master_requirement_priority', 'requirement-statuses': 'master_requirement_status' };
const fields = { requirement_type: masters['requirement-types'], priority: masters['requirement-priorities'], status: masters['requirement-statuses'] };
const fail = (status, message, fields = {}) => { throw Object.assign(new Error(message), { status, fields }); };
const json = (status, value) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
export function isAnonymousRequirementsRequest(request) {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET') return /^\/api\/(?:requirements(?:\/[^/]+)?|masters\/requirement-(?:types|priorities|statuses))$/.test(path);
  if (request.method === 'POST') return /^\/api\/requirements(?:\/[^/]+\/prs)?$/.test(path);
  if (request.method === 'PATCH') return /^\/api\/(?:requirements|requirement-prs)\/[^/]+$/.test(path);
  return false;
}
export async function handleRequirementsApi(request, { config, headers, user, fetcher }) {
  const url = new URL(request.url), path = url.pathname;
  if (!/^\/api\/(requirements|requirement-prs|masters)(\/|$)/.test(path)) return null;
  if (!user && !isAnonymousRequirementsRequest(request)) return json(401, { error: 'กรุณาเข้าสู่ระบบ' });
  try {
    async function db(table, params = {}, method = 'GET', body, count = false) {
      const response = await fetcher(`${config.url}/rest/v1/${table}?${new URLSearchParams(params)}`, {
        method, headers: { ...headers, prefer: count ? 'count=exact' : 'return=representation' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (['PGRST205', '42P01'].includes(error.code)) fail(503, 'ฐานข้อมูล Requirements ยังไม่พร้อม กรุณาติดตั้ง SQL สำหรับ Requirements ก่อนใช้งาน');
        if (error.code === '23505') fail(409, 'PR URL นี้มีอยู่แล้ว');
        if (response.status === 403 || error.code === '42501') fail(403, 'ไม่มีสิทธิ์เข้าถึงข้อมูล');
        if (['23503', '23514', '22001', 'P0001'].includes(error.code)) fail(422, 'ข้อมูลไม่ถูกต้อง หรือ Master ถูกปิดใช้งาน');
        fail(500, 'ไม่สามารถดำเนินการกับฐานข้อมูลได้');
      }
      return { rows: await response.json(), total: Number(response.headers.get('content-range')?.split('/')[1] || 0) };
    }
    async function one(table, id) {
      const { rows } = await db(table, { id: `eq.${id}`, valid: 'eq.true' });
      if (!rows[0]) fail(404, 'ไม่พบรายการ');
      return rows[0];
    }
    const master = path.match(/^\/api\/masters\/([^/]+)$/);
    if (master && masters[master[1]]) {
      if (request.method !== 'GET') fail(405, 'Method not allowed');
      return json(200, (await db(masters[master[1]], { valid: 'eq.true', select: 'id,code,name,description,sort_sequence', order: 'sort_sequence.desc,code.asc' })).rows);
    }
    const match = path.match(/^\/api\/(requirements|requirement-prs)(?:\/([^/]+)(\/prs)?)?$/);
    if (!match) fail(404, 'ไม่พบ API');
    const [, resource, id, prs] = match;
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) fail(404, 'ไม่พบรายการ');
    if (request.method === 'GET' && resource === 'requirements' && !prs) {
      if (id) {
        const record = await one('requirement_listing', id);
        record.prs = (await db('requirement_prs', { requirement_id: `eq.${id}`, valid: 'eq.true', order: 'created_at.desc,id.desc' })).rows;
        return json(200, record);
      }
      const integer = (name, fallback, max) => {
        const raw = url.searchParams.get(name) ?? String(fallback);
        const value = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > max) fail(400, `Invalid ${name}`);
        return value;
      };
      const page = integer('page', 1, 1000000), size = integer('page_size', 20, 100);
      const params = { valid: 'eq.true', order: 'type_sequence.desc,priority_sequence.desc,created_at.asc,id.asc', limit: String(size), offset: String((page - 1) * size) };
      for (const field of Object.keys(fields)) {
        const value = url.searchParams.get(field);
        if (value !== null) {
          if (!/^[A-Z][A-Z0-9_]{0,29}$/.test(value)) fail(400, `Invalid ${field}`);
          params[field] = `eq.${value}`;
        }
      }
      const search = url.searchParams.get('search');
      if (search) {
        if (search.length > 500) fail(400, 'Search ยาวเกินไป');
        // Quote PostgREST operands; escape LIKE metacharacters to search literal text.
        const literal = search.replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"').replace(/\*/g, '\\*');
        params.or = `(title.ilike."%${literal}%",description.ilike."%${literal}%")`;
      }
      const { rows, total } = await db('requirement_listing', params, 'GET', undefined, true);
      return json(200, { items: rows, pagination: { page, page_size: size, total, total_pages: Math.ceil(total / size) } });
    }
    const isPR = resource === 'requirement-prs' || !!prs;
    const creating = request.method === 'POST';
    if (!(creating && resource === 'requirements' && (!id || prs)) && !(request.method === 'PATCH' && id && !prs)) fail(405, 'Method not allowed');
    const table = isPR ? 'requirement_prs' : 'requirements';
    const existing = creating ? null : await one(table, id);
    if (isPR) await one('requirements', creating ? id : existing.requirement_id);
    let body;
    try { body = await request.json(); } catch { fail(400, 'JSON ไม่ถูกต้อง'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'JSON ต้องเป็น object');
    const allowed = isPR ? ['provider', 'repository_name', 'pr_number', 'pr_url', 'pr_status'] : ['title', 'description', ...Object.keys(fields)];
    const data = Object.fromEntries(allowed.filter(key => Object.hasOwn(body, key)).map(key => [key, body[key]]));
    const errors = {};
    function text(key, max, required = false) {
      if (!Object.hasOwn(data, key) && !(creating && required)) return;
      const value = data[key];
      if (!required && value === null) return;
      if (typeof value !== 'string' || (required && !value.trim()) || (typeof value === 'string' && [...value.trim()].length > max)) errors[key] = `กรุณาระบุ ${key} ให้ถูกต้อง (ไม่เกิน ${max} ตัวอักษร)`;
      else data[key] = value.trim();
    }
    if (isPR) {
      if (creating && !Object.hasOwn(data, 'pr_status')) data.pr_status = 'OPEN';
      text('provider', 30, true); text('pr_url', 10000, true); text('repository_name', 255); text('pr_number', 50);
      for (const [key, values] of Object.entries({ provider: ['GITHUB', 'AZURE_DEVOPS', 'GITLAB'], pr_status: ['OPEN', 'MERGED', 'CLOSED'] })) {
        if (Object.hasOwn(data, key) && !values.includes(data[key])) errors[key] = 'ตัวเลือกไม่ถูกต้อง';
      }
      if (data.pr_url) { try { const u = new URL(data.pr_url); if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) throw Error(); } catch { errors.pr_url = 'กรุณาระบุ absolute HTTPS URL'; } }
      if (creating) data.requirement_id = id;
    } else {
      text('title', 255, true); text('description', 1000000);
      if (creating) for (const [key, value] of Object.entries({ requirement_type: 'FEATURE', priority: 'MEDIUM', status: 'PENDING' })) if (!Object.hasOwn(data, key)) data[key] = value;
      for (const [key, masterTable] of Object.entries(fields)) {
        if (!Object.hasOwn(data, key) || (!creating && data[key] === existing[key])) continue;
        if (typeof data[key] !== 'string' || !/^[A-Z][A-Z0-9_]{0,29}$/.test(data[key])) { errors[key] = 'Master code ไม่ถูกต้อง'; continue; }
        if (!(await db(masterTable, { code: `eq.${data[key]}`, valid: 'eq.true', select: 'code' })).rows.length) errors[key] = 'Master code ไม่ถูกต้องหรือถูกปิดใช้งาน';
      }
    }
    if (Object.keys(errors).length) fail(422, 'กรุณาตรวจสอบข้อมูล', errors);
    if (creating) data.created_by = user?.id ?? 'anonymous';
    else { data.modified_by = user?.id ?? 'anonymous'; data.modified_at = new Date().toISOString(); }
    const result = await db(table, creating ? {} : { id: `eq.${id}`, valid: 'eq.true' }, creating ? 'POST' : 'PATCH', data);
    if (!result.rows[0]) fail(404, 'ไม่พบรายการ');
    return json(creating ? 201 : 200, result.rows[0]);
  } catch (error) {
    return json(error.status || 500, { error: error.status ? error.message : 'ดำเนินการไม่สำเร็จ', fields: error.fields || {} });
  }
}
