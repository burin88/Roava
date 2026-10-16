import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { handleAuthenticatedApi } from '../server/authenticated-api.mjs';
import { startMediaServer } from '../server/media-server.mjs';
import { onRequest } from '../functions/api/[[path]].js';
import { testEnv, testOwner } from './fixtures/supabase-api.mjs';

const other = '22222222-2222-4222-8222-222222222222';
const id = '33333333-3333-4333-8333-333333333333';
const prId = '44444444-4444-4444-8444-444444444444';
const sql = await readFile(new URL('../database/requirements.sql', import.meta.url), 'utf8');
test('PostgreSQL: repeatable schema, database ordering/pagination, audit, inactive masters, PR constraints and account isolation', async () => {
  const { PGlite } = await import('../tmp/roava-postgres-test/node_modules/@electric-sql/pglite/dist/index.js');
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(sql); await db.exec(sql);
    const scalar = async query => Object.values((await db.query(query)).rows[0])[0];
    const login = async user => db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated`);
    const admin = async () => db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    assert.equal(await scalar('select count(*)::int from master_requirement_type'), 3);
    await db.exec(`insert into requirements(id,title,requirement_type,priority,created_by,created_at) values
      ('${id}','feature','FEATURE','CRITICAL','${testOwner}','2026-01-01'),
      ('00000000-0000-4000-8000-000000000001','bug old','BUG','LOW','${testOwner}','2026-01-01'),
      ('00000000-0000-4000-8000-000000000002','bug tie','BUG','LOW','${testOwner}','2026-01-01'),
      ('00000000-0000-4000-8000-000000000003','bug high','BUG','HIGH','${testOwner}','2026-01-02'),
      ('00000000-0000-4000-8000-000000000004','improvement','IMPROVEMENT','CRITICAL','${testOwner}','2026-01-01');`);
    await login(testOwner);
    const ordered = await db.query('select title from requirement_listing order by type_sequence desc,priority_sequence desc,created_at,id');
    assert.deepEqual(ordered.rows.map(r=>r.title), ['bug high','bug old','bug tie','improvement','feature']);
    assert.deepEqual((await db.query('select title from requirement_listing order by type_sequence desc,priority_sequence desc,created_at,id limit 2 offset 2')).rows.map(r=>r.title), ['bug tie','improvement']);
    assert.equal(await scalar("select count(*)::int from requirement_listing where title ilike '%bug%' and status='PENDING'"),3);
    const inserted = (await db.query(`insert into requirements(title,created_by,created_at) values ('  new  ','fake','2000-01-01') returning *`)).rows[0];
    assert.equal(inserted.title,'new'); assert.equal(inserted.created_by,testOwner); assert.equal(inserted.modified_at,null);
    await db.exec(`update requirements set title='edited',created_by='fake',created_at='2000-01-01',modified_by='fake' where id='${inserted.id}'`);
    const changed = (await db.query(`select * from requirements where id='${inserted.id}'`)).rows[0];
    assert.equal(changed.created_by,testOwner); assert.equal(changed.modified_by,testOwner); assert.ok(changed.modified_at);
    assert.deepEqual(changed.created_at,inserted.created_at);
    await assert.rejects(db.exec("insert into requirements(title,created_by) values ('  ','fake')"));
    await admin(); await db.exec("update master_requirement_type set valid=false where code='FEATURE'");
    await login(testOwner);
    assert.equal(await scalar(`select title from requirement_listing where id='${id}'`),'feature');
    await db.exec(`update requirements set title='feature edited',requirement_type='FEATURE' where id='${id}'`);
    await assert.rejects(db.exec("insert into requirements(title,created_by) values ('invalid','fake')"));
    await assert.rejects(db.exec("update requirements set requirement_type='FEATURE' where title='bug high'"));
    const pr = (await db.query(`insert into requirement_prs(requirement_id,provider,pr_url,created_by) values ('${id}','GITHUB','https://github.com/a/b/pull/1','fake') returning *`)).rows[0];
    await db.exec(`insert into requirement_prs(requirement_id,provider,pr_url,created_by) values ('${id}','GITLAB','https://gitlab.com/a/b/merge_requests/1','fake')`);
    assert.equal(await scalar(`select pr_count::int from requirement_listing where id='${id}'`),2);
    await assert.rejects(db.exec(`insert into requirement_prs(requirement_id,provider,pr_url,created_by) values ('${id}','GITHUB','https://github.com/a/b/pull/1','fake')`),e=>e.code==='23505');
    await assert.rejects(db.exec(`update requirement_prs set pr_url='http://bad' where id='${pr.id}'`));
    await assert.rejects(db.exec(`update requirement_prs set provider='OTHER' where id='${pr.id}'`));
    await assert.rejects(db.exec(`update requirement_prs set requirement_id='${inserted.id}' where id='${pr.id}'`));
    await db.exec(`update requirement_prs set pr_status='MERGED' where id='${pr.id}'`);
    assert.equal(await scalar(`select status from requirements where id='${id}'`),'PENDING');
    await login(other);
    assert.equal(await scalar('select count(*)::int from requirement_listing'),0);
    assert.equal(await scalar('select count(*)::int from requirement_prs'),0);
    assert.equal((await db.query(`update requirements set title='forbidden' where id='${id}' returning id`)).rows.length,0);
    await assert.rejects(db.exec(`insert into requirement_prs(requirement_id,provider,pr_url,created_by) values ('${id}','GITHUB','https://example.com','fake')`));
    await admin(); await db.exec(`update requirements set valid=false where id='${id}'`);
    await login(testOwner);
    assert.equal(await scalar(`select count(*)::int from requirement_listing where id='${id}' and valid`),0);
    assert.equal(await scalar(`select count(*)::int from requirement_prs where requirement_id='${id}'`),0);
    await assert.rejects(db.exec('delete from requirements'));
    await assert.rejects(db.exec("update master_requirement_type set valid=true"));
    await admin(); await db.exec('set role anon');
    await assert.rejects(db.query('select * from requirement_listing'));
    await admin();
    const publicRead=await readFile(new URL('../database/requirements-anonymous-read.sql',import.meta.url),'utf8');
    await db.exec(publicRead); await db.exec(publicRead); await db.exec('set role anon');
    assert.ok(await scalar('select count(*)::int from requirement_listing') > 0);
    assert.equal(await scalar(`select count(*)::int from requirement_listing where id='${id}'`),0);
    await assert.rejects(db.exec("insert into requirements(title,created_by) values ('anonymous','fake')"));
    await assert.rejects(db.exec("update requirements set title='anonymous'"));
    await admin();
    await db.exec(`insert into requirement_prs(id,requirement_id,provider,pr_url,created_by) values ('${prId}','${inserted.id}','GITHUB','https://github.com/a/b/pull/anonymous','${testOwner}')`);
    const anonymousUpdate=await readFile(new URL('../database/requirement-prs-anonymous-update.sql',import.meta.url),'utf8');
    await db.exec(anonymousUpdate); await db.exec(anonymousUpdate); await db.exec('set role anon');
    await db.exec(`update requirement_prs set pr_status='MERGED',modified_by='forged' where id='${prId}'`);
    const updatedPR=(await db.query(`select * from requirement_prs where id='${prId}'`)).rows[0];
    assert.equal(updatedPR.pr_status,'MERGED'); assert.equal(updatedPR.modified_by,'anonymous'); assert.equal(updatedPR.created_by,testOwner); assert.ok(updatedPR.modified_at);
    for(const change of ["requirement_id='00000000-0000-4000-8000-000000000001'","valid=false","created_by='forged'","pr_url='http://unsafe'","provider='OTHER'"]) await assert.rejects(db.exec(`update requirement_prs set ${change} where id='${prId}'`));
    await assert.rejects(db.exec(`insert into requirement_prs(requirement_id,provider,pr_url,created_by) values ('${inserted.id}','GITHUB','https://example.com','fake')`));
    await assert.rejects(db.exec('delete from requirement_prs'));
    assert.equal(await scalar(`select status from requirements where id='${inserted.id}'`),'PENDING');
    await admin();
    const publicAccess=await readFile(new URL('../database/requirements-anonymous.sql',import.meta.url),'utf8');
    await db.exec(publicAccess); await db.exec(publicAccess); await db.exec('set role anon');
    const publicRequirement=(await db.query("insert into requirements(title,requirement_type,created_by) values ('public task','BUG','forged') returning *")).rows[0];
    assert.equal(publicRequirement.created_by,'anonymous'); assert.equal(publicRequirement.modified_at,null); assert.equal(publicRequirement.valid,true);
    await db.exec(`update requirements set title='public edit',status='IN_PROGRESS',modified_by='forged' where id='${publicRequirement.id}'`);
    const publicEdit=(await db.query(`select * from requirements where id='${publicRequirement.id}'`)).rows[0];
    assert.equal(publicEdit.title,'public edit'); assert.equal(publicEdit.modified_by,'anonymous'); assert.equal(publicEdit.created_by,'anonymous'); assert.deepEqual(publicEdit.created_at,publicRequirement.created_at);
    const publicPR=(await db.query(`insert into requirement_prs(requirement_id,provider,pr_url,created_by) values ('${publicRequirement.id}','GITHUB','https://example.com/public-pr','forged') returning *`)).rows[0];
    assert.equal(publicPR.created_by,'anonymous');
    await db.exec(`update requirement_prs set pr_status='MERGED' where id='${publicPR.id}'`);
    assert.equal(await scalar(`select modified_by from requirement_prs where id='${publicPR.id}'`),'anonymous');
    assert.equal(await scalar(`select status from requirements where id='${publicRequirement.id}'`),'IN_PROGRESS');
    await assert.rejects(db.exec(`insert into requirement_prs(requirement_id,provider,pr_url,created_by) values ('${publicRequirement.id}','GITHUB','https://example.com/public-pr','forged')`),e=>e.code==='23505');
    await assert.rejects(db.exec("insert into requirements(title,requirement_type,created_by) values ('bad','FEATURE','anonymous')"));
    await assert.rejects(db.exec("insert into requirements(title,requirement_type,created_by) values ('  ','BUG','anonymous')"));
    await assert.rejects(db.exec(`update requirements set created_by='forged' where id='${publicRequirement.id}'`));
    await assert.rejects(db.exec('delete from requirements')); await assert.rejects(db.exec('delete from requirement_prs'));
    await assert.rejects(db.exec("update master_requirement_type set name='forged'"));
    await login(other);
    assert.equal(await scalar(`select title from requirements where id='${publicRequirement.id}'`),'public edit');
    await db.exec(`update requirements set title='signed-in edit' where id='${publicRequirement.id}'`);
    assert.equal(await scalar(`select modified_by from requirements where id='${publicRequirement.id}'`),other);
  } finally { await db.close(); }
});

function fixture({ inactive = false, duplicate = false, missing = false } = {}) {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const u = new URL(url), table = u.pathname.split('/').at(-1), method = options.method || 'GET';
    calls.push({ table, params: u.searchParams, method, body: options.body && JSON.parse(options.body) });
    if (u.pathname === '/auth/v1/user') return Response.json({ id: testOwner });
    if (method === 'GET') {
      if (table.startsWith('master_')) return Response.json(inactive ? [] : [{ code: 'FEATURE' }]);
      if (table === 'requirement_listing') return Response.json(missing ? [] : [{ id, title: 'old', requirement_type: 'FEATURE', priority: 'MEDIUM', status: 'PENDING' }], { headers: { 'content-range': '0-0/43' } });
      if (table === 'requirements') return Response.json(missing ? [] : [{ id, title: 'old', requirement_type: 'FEATURE', priority: 'MEDIUM', status: 'PENDING' }]);
      if (table === 'requirement_prs') return Response.json(missing ? [] : [{ id: prId, requirement_id: id }]);
    }
    if (duplicate) return Response.json({ code: '23505', message: 'SECRET SQL' }, { status: 409 });
    return Response.json([{ ...JSON.parse(options.body), id: table === 'requirements' ? id : prId }]);
  };
  const send = (path, method = 'GET', body, authenticated = true) => handleAuthenticatedApi(new Request(`https://app.test/api/${path}`, {
    method, headers: { ...(authenticated ? { authorization: 'Bearer token' } : {}), 'content-type': 'application/json' },
    ...(body !== undefined && method !== 'GET' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  }), () => { throw Error('R2 must not be needed'); }, testEnv, fetcher);
  return { calls, send };
}
test('API validates pagination/JSON/IDs and keeps unsupported methods protected', async () => {
  const f = fixture();
  assert.equal((await f.send('requirements','POST',{ title:'ok' },false)).status,201);
  for (const query of ['page=0','page=abc','page_size=101','page=1.2','status=X%22,priority.eq.HIGH']) assert.equal((await f.send(`requirements?${query}`)).status,400);
  assert.equal((await f.send('requirements','POST','{')).status,400);
  assert.equal((await f.send('requirements','POST',[])).status,400);
  assert.equal((await f.send('requirements/no-id')).status,404);
  assert.equal((await f.send('requirements','DELETE')).status,405);
});
test('Requirements route directly without auth checks; unsupported methods return 405 and unrelated APIs require auth',async()=>{
  const f=fixture();
  for(const path of ['requirements',`requirements/${id}`,'masters/requirement-types','masters/requirement-priorities','masters/requirement-statuses']) {
    assert.equal((await f.send(path,'GET',undefined,false)).status,200);
  }
  assert.ok(!f.calls.some(call=>call.table==='user'));
  assert.equal((await f.send('requirements','POST',{title:'public',created_by:'forged',valid:false},false)).status,201);
  assert.equal(f.calls.at(-1).body.created_by,'anonymous'); assert.equal(f.calls.at(-1).body.valid,undefined);
  assert.equal((await f.send(`requirements/${id}`,'PATCH',{title:'public edit',created_by:'forged'},false)).status,200);
  assert.equal(f.calls.at(-1).body.modified_by,'anonymous'); assert.equal(f.calls.at(-1).body.created_by,undefined);
  assert.equal((await f.send(`requirements/${id}/prs`,'POST',{provider:'GITHUB',pr_url:'https://example.com/new-pr'},false)).status,201);
  assert.equal(f.calls.at(-1).body.created_by,'anonymous'); assert.equal(f.calls.at(-1).body.requirement_id,id);
  for(const path of ['media','files']) assert.equal((await f.send(path,'GET',undefined,false)).status,401);
  for(const [path,method] of [['requirements','DELETE'],[`requirement-prs/${prId}`,'DELETE'],['masters/requirement-types','POST']]) assert.equal((await f.send(path,method,{},false)).status,405);
  const updated=await f.send(`requirement-prs/${prId}`,'PATCH',{pr_status:'MERGED',modified_by:'forged',created_by:'forged',requirement_id:other},false);
  assert.equal(updated.status,200); assert.equal(f.calls.at(-1).body.modified_by,'anonymous'); assert.equal(f.calls.at(-1).body.requirement_id,undefined); assert.equal(f.calls.at(-1).body.created_by,undefined);
  assert.ok(!f.calls.some(call=>call.table==='user'));
  assert.equal((await f.send(`requirement-prs/${prId}`,'PATCH',{pr_url:'http://bad'},false)).status,422);
  assert.equal((await fixture({duplicate:true}).send(`requirement-prs/${prId}`,'PATCH',{pr_url:'https://example.com'},false)).status,409);
  assert.equal((await fixture({missing:true}).send(`requirement-prs/${prId}`,'PATCH',{pr_status:'MERGED'},false)).status,404);
});
test('API list sorts and paginates at DB, returns filtered count, quotes search grammar',async()=>{
  const f=fixture(); const response=await f.send('requirements?page=2&page_size=20&status=PENDING&search='+encodeURIComponent('x"),status.eq.COMPLETED,('));
  const data=await response.json(); assert.equal(response.status,200); assert.equal(data.pagination.total,43); assert.equal(data.pagination.total_pages,3);
  const call=f.calls.at(-1); assert.equal(call.table,'requirement_listing');
  assert.equal(call.params.get('order'),'type_sequence.desc,priority_sequence.desc,created_at.asc,id.asc');
  assert.equal(call.params.get('offset'),'20'); assert.equal(call.params.get('status'),'eq.PENDING');
  assert.ok(call.params.get('or').includes('x\\"'));
});
test('Requirements ignores supplied Authorization and never calls Auth or forwards credentials',async()=>{
  for (const authorization of [null,'Bearer expired-token','malformed-header']) {
    const calls=[];
    const response=await handleAuthenticatedApi(new Request('https://app.test/api/requirements',{
      headers:authorization?{authorization}:{},
    }),()=>{throw Error('No storage needed');},testEnv,async(url,options)=>{
      calls.push(url); assert.ok(!url.includes('/auth/'));
      assert.equal(new Headers(options.headers).has('authorization'),false);
      return Response.json([],{headers:{'content-range':'*/0'}});
    });
    assert.equal(response.status,200); assert.equal(calls.length,1);
  }
});
test('API lookups use valid and database sort; detail returns PRs in descending order',async()=>{
  const f=fixture();
  for(const master of ['types','priorities','statuses']) { assert.equal((await f.send(`masters/requirement-${master}`)).status,200); assert.equal(f.calls.at(-1).params.get('valid'),'eq.true'); assert.equal(f.calls.at(-1).params.get('order'),'sort_sequence.desc,code.asc'); }
  const data=await (await f.send(`requirements/${id}`)).json(); assert.ok(Array.isArray(data.prs)); assert.equal(f.calls.at(-1).params.get('order'),'created_at.desc,id.desc');
});
test('API create defaults, trims title and excludes forged audit/identity',async()=>{
  const f=fixture(); const response=await f.send('requirements','POST',{ title:'  good  ',created_by:'attacker',id:other,valid:false });
  assert.equal(response.status,201);
  const body=f.calls.at(-1).body; assert.equal(body.title,'good'); assert.equal(body.created_by,'anonymous'); assert.equal(body.id,undefined); assert.equal(body.valid,undefined);
  assert.equal(body.requirement_type,'FEATURE'); assert.equal(body.priority,'MEDIUM'); assert.equal(body.status,'PENDING');
});
test('API validates fields, inactive masters and preserves unchanged inactive values',async()=>{
  for(const body of [{title:'   '},{title:'x'.repeat(256)},{title:'ok',priority:null},{title:'ok',description:42}]) assert.equal((await fixture().send('requirements','POST',body)).status,422);
  const f=fixture({inactive:true}); assert.equal((await f.send('requirements','POST',{title:'good'})).status,422);
  assert.equal((await f.send(`requirements/${id}`,'PATCH',{title:'edited',requirement_type:'FEATURE'})).status,200);
  assert.equal((await f.send(`requirements/${id}`,'PATCH',{requirement_type:'BUG'})).status,422);
});
test('API PRs validate HTTPS, enums, lengths and never accept a different parent or audit identity',async()=>{
  for(const body of [{provider:'BAD',pr_url:'https://example.com'},{provider:'GITHUB',pr_url:'http://bad'},{provider:'GITHUB',pr_url:'https://user:pass@example.com'},{provider:'GITHUB',pr_url:'https://example.com',pr_status:null},{provider:'GITHUB',pr_url:'https://example.com',pr_number:'x'.repeat(51)}]) assert.equal((await fixture().send(`requirements/${id}/prs`,'POST',body)).status,422);
  const f=fixture(); assert.equal((await f.send(`requirements/${id}/prs`,'POST',{provider:'GITHUB',pr_url:'https://example.com',requirement_id:other})).status,201);
  assert.equal(f.calls.at(-1).body.requirement_id,id); assert.equal(f.calls.at(-1).body.pr_status,'OPEN');
  assert.equal((await f.send(`requirement-prs/${prId}`,'PATCH',{pr_status:'MERGED',requirement_id:other,created_by:'fake'})).status,200);
  assert.equal(f.calls.at(-1).body.requirement_id,undefined); assert.equal(f.calls.at(-1).body.created_by,undefined); assert.equal(f.calls.at(-1).body.modified_by,'anonymous');
});
test('API maps duplicate PR to 409 without SQL details and missing/inactive records to 404',async()=>{
  const f=fixture({duplicate:true}); const response=await f.send(`requirements/${id}/prs`,'POST',{provider:'GITHUB',pr_url:'https://example.com'});
  assert.equal(response.status,409); assert.ok(!(await response.text()).includes('SECRET'));
  for(const [path,method] of [[`requirements/${id}`,'GET'],[`requirements/${id}`,'PATCH'],[`requirements/${id}/prs`,'POST'],[`requirement-prs/${prId}`,'PATCH']]) assert.equal((await fixture({missing:true}).send(path,method,{title:'ok'})).status,404);
});

test('Node and Cloudflare mount requirements without requiring R2',async()=>{
  const f=fixture();
  const storage=()=>{throw Error('Requirements must not initialize R2');};
  const server=await startMediaServer(0,storage,{env:testEnv,fetcher:async(url,options)=>{
    // Use a separate lightweight upstream to verify both adapters route to the API.
    return Response.json(new URL(url).pathname==='/auth/v1/user'?{id:testOwner}:[]);
  }});
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/requirements`,{headers:{authorization:'Bearer token'}});
    assert.equal(response.status,200); assert.deepEqual((await response.json()).items,[]);
    // Unsupported methods are rejected by the resource handler without Auth calls.
    assert.equal((await onRequest({request:new Request('https://app.test/api/requirements',{method:'DELETE'}),env:testEnv})).status,405);
    const unavailable=await handleAuthenticatedApi(new Request('https://app.test/api/requirements',{headers:{authorization:'Bearer token'}}),storage,testEnv,async(url)=>{
      if(new URL(url).pathname==='/auth/v1/user') return Response.json({id:testOwner});
      return Response.json({message:'secret internal SQL and key'},{status:500});
    });
    assert.equal(unavailable.status,500); assert.ok(!(await unavailable.text()).includes('secret'));
  } finally { await new Promise(resolve=>server.close(resolve)); }
});

test('UI loads masters, opens empty-state creation, retains input on errors and refreshes detail/list after saving',async()=>{
  const source=ts.transpileModule(await readFile(new URL('../src/app/features/requirements/requirements.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
  const signal=value=>{const get=()=>value; get.set=next=>{value=next;};return get;};
  const exports={}; let rejectSave=false; const requests=[];
  const record={id,title:'new',description:'',requirement_type:'FEATURE',priority:'MEDIUM',status:'PENDING',prs:[]};
  const fetch=async(url,options)=>{
    assert.equal(new Headers(options.headers).has('authorization'),false);
    requests.push(url);
    if(options.method==='POST' && rejectSave) return Response.json({error:'invalid',fields:{title:'invalid'}},{status:422});
    if(url.includes('masters/')) return Response.json([{code:'FEATURE',name:'Feature'}]);
    if(url.includes('requirements?')) return Response.json({items:[],pagination:{total:0,total_pages:0}});
    return Response.json(record);
  };
  let signedIn=true;
  vm.runInNewContext(source,{exports,URL,URLSearchParams,fetch,setTimeout:fn=>fn(),require:name=>name==='@angular/core'?{Component:()=>()=>{},ViewChild:()=>()=>{},inject:()=>({initialized:Promise.resolve(),user:()=>signedIn?{id:testOwner}:null,token:async()=>'token'}),signal}:name==='@angular/common'?{DatePipe:class{}}:name==='@angular/forms'?{FormsModule:class{}}:{SupabaseService:class{}}});
  const ui=new exports.Requirements(); await ui.initialize();
  assert.equal(ui.items().length,0); assert.equal(ui.lookupReady(),true); ui.create(); assert.equal(ui.editing(),true); assert.equal(ui.form.priority,'MEDIUM');
  ui.form.title='typed'; rejectSave=true; await ui.save(); assert.equal(ui.form.title,'typed'); assert.equal(ui.fields().title,'invalid'); assert.equal(ui.saving(),false);
  rejectSave=false; await ui.save(); assert.equal(ui.detail().id,id); assert.equal(ui.editing(),true); assert.ok(ui.success());
  signedIn=false; await ui.initialize(); assert.equal(ui.error(),'');
  const before=requests.length; ui.create(); ui.form.title='anonymous'; await ui.save(); assert.ok(requests.length>before); assert.equal(ui.formError(),'');
  ui.openPR(); await ui.savePR(); assert.equal(ui.prError(),''); assert.ok(requests.some(path=>path===`/api/requirements/${id}/prs`));
  ui.openPR({id:prId,provider:'GITHUB',pr_url:'https://example.com',pr_status:'OPEN'}); await ui.savePR(); assert.equal(ui.prError(),''); assert.ok(requests.some(path=>path===`/api/requirement-prs/${prId}`));
  const template=await readFile(new URL('../src/app/features/requirements/requirements.html',import.meta.url),'utf8');
  assert.ok(template.includes('ยังไม่มี Requirement')); assert.ok(template.includes('ไม่พบรายการตามเงื่อนไข')); assert.ok(template.includes('ยังไม่มี Pull Request')); assert.equal((template.match(/\+ เพิ่ม Requirement/g)||[]).length,2);
  assert.ok(template.includes('rel="noopener noreferrer"')); assert.ok(!template.includes('innerHTML'));
});
