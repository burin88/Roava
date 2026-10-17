import { MediaStorageService, imageExtensions } from './services/media-storage.service.mjs';

const masters = { 'requirement-types': 'master_requirement_type', 'requirement-priorities': 'master_requirement_priority', 'requirement-statuses': 'master_requirement_status' };
const fields = { requirement_type: masters['requirement-types'], priority: masters['requirement-priorities'], status: masters['requirement-statuses'] };
const fail = (status, message, fields = {}) => { throw Object.assign(new Error(message), { status, fields }); };
const json = (status, value) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
export async function handleRequirementsApi(request, { config, headers, fetcher, user, storageFactory }) {
  const url = new URL(request.url), path = url.pathname;
  if (!/^\/api\/(requirements|requirement-prs|masters)(\/|$)/.test(path)) return null;
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
    const image = path.match(/^\/api\/requirements\/([0-9a-f-]{36})\/(?:image|images\/([0-9a-f-]{36}))$/i);
    if (image) {
      if (request.method !== 'GET') fail(405, 'Method not allowed');
      const requirement = await one('requirements', image[1]);
      const images = requirement.attachments ?? (requirement.attachments_id ? [{ id: requirement.attachments_id, profiles_id: requirement.attachments_profiles_id }] : []);
      const selected = image[2] ? images.find(item => item.id === image[2] && (!url.searchParams.has('profile') || item.profiles_id === url.searchParams.get('profile'))) : images[0];
      if (!selected?.id || !selected.profiles_id) fail(404, 'Photo not found');
      const { rows } = await db('attachments', { id: `eq.${selected.id}`, profiles_id: `eq.${selected.profiles_id}`, type: 'eq.requirement', valid: 'eq.true', status: 'eq.ready', select: 'id,profiles_id' });
      if (!rows.length) fail(404, 'Photo not found');
      const media = new MediaStorageService(storageFactory());
      const record = await media.getRecord(selected.id);
      // Never trust editable DB metadata alone to authorize an R2 object.
      if (!record || record.ownerId !== selected.profiles_id || !imageExtensions.has(record.contentType)) fail(404, 'Photo not found');
      const file = await media.storage.read(record.key);
      if (!file) fail(404, 'Photo not found');
      return new Response(file.body, { headers: { 'content-type': record.contentType, 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' } });
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
    const allowed = isPR ? ['provider', 'repository_name', 'pr_number', 'pr_url', 'pr_status'] : ['title', 'description', 'attachments_id', 'attachments', ...Object.keys(fields)];
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
      if (Object.hasOwn(data, 'attachments')) {
        if (Object.hasOwn(data, 'attachments_id')) errors.attachments = 'กรุณาส่งรายการรูปแนบเพียงรูปแบบเดียว';
        if (!Array.isArray(data.attachments) || data.attachments.length > 20) errors.attachments = 'แนบรูปได้สูงสุด 20 รูป';
        else {
          const seen = new Set();
          const previous = existing?.attachments ?? [];
          const normalized = [];
          for (const image of data.attachments) {
            if (!image || typeof image.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(image.id)) { errors.attachments = 'รายการรูปแนบไม่ถูกต้อง'; break; }
            const retained = previous.find(item => item.id === image.id && item.profiles_id === image.profiles_id);
            const owner = retained?.profiles_id ?? user?.id;
            if (!owner || (!retained && image.profiles_id && image.profiles_id !== owner)) { errors.attachments = 'กรุณาเข้าสู่ระบบและเลือกรูปแนบใหม่'; break; }
            const key = `${owner}/${image.id}`;
            if (seen.has(key)) { errors.attachments = 'มีรูปแนบซ้ำ'; break; }
            seen.add(key);
            if (!retained) {
              const { rows } = await db('attachments', { id: `eq.${image.id}`, profiles_id: `eq.${owner}`, type: 'eq.requirement', valid: 'eq.true', status: 'eq.ready', select: 'id,mime_type' });
              if (!rows.length || !imageExtensions.has(rows[0].mime_type)) { errors.attachments = 'ไม่พบรูปแนบสำหรับ Requirement'; break; }
            }
            normalized.push({ id: image.id, profiles_id: owner });
          }
          data.attachments = normalized;
        }
      }
      if (Object.hasOwn(data, 'attachments_id') && data.attachments_id !== (existing?.attachments_id ?? null)) {
        if (data.attachments_id !== null && (typeof data.attachments_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(data.attachments_id) || !user)) errors.attachments_id = 'กรุณาเข้าสู่ระบบและเลือกรูปแนบใหม่';
        else if (data.attachments_id !== null) {
          const { rows } = await db('attachments', { id: `eq.${data.attachments_id}`, profiles_id: `eq.${user.id}`, type: 'eq.requirement', valid: 'eq.true', status: 'eq.ready', select: 'id,mime_type' });
          if (!rows.length || !rows[0].mime_type?.startsWith('image/')) errors.attachments_id = 'ไม่พบรูปแนบสำหรับ Requirement';
          else data.attachments_profiles_id = user.id;
        }
      }
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
