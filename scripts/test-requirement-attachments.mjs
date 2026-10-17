import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleAuthenticatedApi } from '../server/authenticated-api.mjs';
import { testEnv, testOwner, supabaseFixture } from './fixtures/supabase-api.mjs';
import { MediaStorageService } from '../server/services/media-storage.service.mjs';
import vm from 'node:vm';
import ts from 'typescript';

const attachment = '55555555-5555-4555-8555-555555555555';
const requirement = '33333333-3333-4333-8333-333333333333';
const other = '22222222-2222-4222-8222-222222222222';
const attachment2 = '66666666-6666-4666-8666-666666666666';
test('media upload stores requirement origin and the authenticated owner', async () => {
  const fixture = supabaseFixture(), files = new Map();
  const storage = { write:async(key,body,metadata)=>files.set(key,{body,...metadata}), delete:async key=>files.delete(key) };
  const response = await handleAuthenticatedApi(new Request('https://app.test/api/media', {
    method:'POST',headers:{authorization:'Bearer test-token','content-type':'image/png','x-file-name':'test.png','x-attachment-type':'requirement','x-owner-id':other},body:new Uint8Array([1,2,3]),
  }),()=>storage,fixture.env,fixture.fetcher);
  assert.equal(response.status,201);
  const record = await response.json(), row=fixture.attachments.get(record.id);
  assert.equal(row.type,'requirement'); assert.equal(row.profiles_id,testOwner); assert.equal(row.status,'ready');
  assert.equal(record.ownerId,testOwner);
});
test('attachment SQL preserves composite ownership, validates type, allows removal and respects requirement visibility', async () => {
  const { PGlite } = await import('../tmp/roava-postgres-test/node_modules/@electric-sql/pglite/dist/index.js');
  const db = new PGlite();
  const sql = name => readFile(new URL(`../database/${name}`, import.meta.url),'utf8');
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      create table attachments(id varchar(128),profiles_id uuid,type varchar(30) check(type in ('trip','place','expense','import')),valid boolean default true,status text,mime_type text, primary key(profiles_id,id));
      alter table attachments enable row level security;
      grant select,insert,update on attachments to authenticated;
      create policy owner on attachments to authenticated using(profiles_id=auth.uid()) with check(profiles_id=auth.uid());`);
    await db.exec(await sql('requirements.sql'));
    // Match the pre-existing live integer column, currently unused.
    await db.exec('alter table requirements add column attachments_id integer');
    const migration = await sql('requirement-attachments.sql');
    await db.exec(migration); await db.exec(migration);
    await db.exec(`insert into attachments values('${attachment}','${testOwner}','requirement',true,'ready','image/png');
      insert into attachments values('${attachment}','${other}','trip',true,'ready','image/png');
      select set_config('request.jwt.claim.sub','${testOwner}',false); set role authenticated;`);
    const row = (await db.query(`insert into requirements(title,created_by,attachments_id) values('image','ignored','${attachment}') returning *`)).rows[0];
    assert.equal(row.attachments_profiles_id,testOwner);
    assert.equal((await db.query(`select attachments_id from requirement_listing where id='${row.id}'`)).rows[0].attachments_id,attachment);
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${other}',false); set role authenticated;`);
    assert.equal((await db.query('select * from requirement_listing')).rows.length,0);
    await assert.rejects(db.exec(`insert into requirements(title,created_by,attachments_id) values('wrong type','ignored','${attachment}')`));
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false)`);
    await db.exec(await sql('requirements-anonymous.sql'));
    // Reapply to grant the attachment column to the optional shared backlog.
    // The anonymous setup must preserve the listing column order (see its view).
    await db.exec(migration);
    await db.exec('set role anon');
    assert.equal((await db.query('select id from attachments')).rows.length,1);
    await db.exec(`update requirements set title='text edit' where id='${row.id}'`);
    await assert.rejects(db.exec(`insert into requirements(title,created_by,attachments_id) values('anonymous upload','anonymous','${attachment}')`));
    await db.exec(`update requirements set attachments_id=null where id='${row.id}'`);
    assert.equal((await db.query('select id from attachments')).rows.length,0);
    assert.equal((await db.query(`select attachments_profiles_id from requirements where id='${row.id}'`)).rows[0].attachments_profiles_id,null);
  } finally { await db.close(); }
});

test('multiple-image SQL migrates old links, saves collections atomically and protects every image reference', async () => {
  const { PGlite } = await import('../tmp/roava-postgres-test/node_modules/@electric-sql/pglite/dist/index.js');
  const db=new PGlite();
  const sql=name=>readFile(new URL(`../database/${name}`,import.meta.url),'utf8');
  const ref=id=>({id,profiles_id:testOwner});
  const value=images=>`'${JSON.stringify(images)}'::jsonb`;
  const login=async owner=>db.exec(`reset role; select set_config('request.jwt.claim.sub','${owner}',false); set role authenticated`);
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      create table attachments(id varchar(128),profiles_id uuid,type varchar(30) check(type in ('trip','place','expense','import')),valid boolean default true,status text,mime_type text,primary key(profiles_id,id));
      alter table attachments enable row level security;
      grant select,insert,update on attachments to authenticated;
      create policy owner on attachments to authenticated using(profiles_id=auth.uid()) with check(profiles_id=auth.uid());`);
    await db.exec(await sql('requirements.sql'));
    await db.exec(await sql('requirement-attachments.sql'));
    await db.exec(`insert into attachments values('${attachment}','${testOwner}','requirement',true,'ready','image/png'),
      ('${attachment2}','${testOwner}','requirement',true,'ready','image/png'),
      ('${attachment2}','${other}','trip',true,'ready','image/png')`);
    await login(testOwner);
    const legacy=(await db.query(`insert into requirements(title,created_by,attachments_id) values('legacy','ignored','${attachment}') returning *`)).rows[0];
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false)`);
    const migration=await sql('requirement-multiple-attachments.sql');
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query(`select attachments from requirement_listing where id='${legacy.id}'`)).rows[0].attachments,[ref(attachment)]);
    await login(testOwner);
    await db.exec(`update requirements set attachments=${value([ref(attachment),ref(attachment2)])} where id='${legacy.id}'`);
    assert.equal((await db.query(`select jsonb_array_length(attachments) as n from requirement_listing where id='${legacy.id}'`)).rows[0].n,2);
    await db.exec(`reset role; alter table attachments add column storage_provider text default 'r2'; alter table attachments add column bucket text default 'roava-storage'; alter table attachments add column path text;
      update attachments set path='roava/media/' || id || '.png' where profiles_id='${testOwner}'`);
    const urlsSql=await sql('requirement-attachment-urls.sql');
    await db.exec(urlsSql); await db.exec(urlsSql); await db.exec(migration);
    assert.equal((await db.query(`select jsonb_array_length(attachment_urls) as n from requirement_listing where id='${legacy.id}'`)).rows[0].n,2);
    await login(testOwner);
    const expectedUrls=[attachment,attachment2].map(id=>`https://pub-53399cf357004c6ebc046f04bd7ea2b7.r2.dev/roava/media/${id}.png`);
    assert.deepEqual((await db.query(`select attachment_urls from requirement_listing where id='${legacy.id}'`)).rows[0].attachment_urls,expectedUrls);
    await db.exec(`reset role; update attachments set path='roava/media/รูป test#1.png' where id='${attachment2}' and profiles_id='${testOwner}'`);
    await login(testOwner);
    const encoded=(await db.query(`select attachment_urls from requirement_listing where id='${legacy.id}'`)).rows[0].attachment_urls;
    assert.ok(encoded[1].endsWith('/roava/media/%E0%B8%A3%E0%B8%B9%E0%B8%9B%20test%231.png'));
    await db.exec(`reset role; update attachments set path='roava/media/${attachment2}.png' where id='${attachment2}' and profiles_id='${testOwner}'`);
    await login(testOwner);
    // A rejected second reference rolls back the title and entire collection.
    const bad={id:attachment2,profiles_id:other};
    await assert.rejects(db.exec(`update requirements set title='must rollback',attachments=${value([ref(attachment),bad])} where id='${legacy.id}'`));
    assert.equal((await db.query(`select title from requirements where id='${legacy.id}'`)).rows[0].title,'legacy');
    for(const images of [[ref(attachment),ref(attachment)],Array(21).fill(ref(attachment)),[{}],[{id:attachment,profiles_id:null}]]) {
      await assert.rejects(db.exec(`update requirements set attachments=${value(images)} where id='${legacy.id}'`));
    }
    await login(other);
    assert.equal((await db.query(`select * from requirement_listing where id='${legacy.id}'`)).rows.length,0);
    await assert.rejects(db.exec(`insert into requirements(title,created_by,attachments) values('steal','ignored',${value([ref(attachment)])})`));
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false)`);
    await db.exec(await sql('requirements-anonymous.sql')); await db.exec(migration);
    await db.exec('set role anon');
    assert.equal((await db.query('select id from attachments')).rows.length,2);
    assert.deepEqual((await db.query(`select attachment_urls from requirement_listing where id='${legacy.id}'`)).rows[0].attachment_urls,[]);
    await assert.rejects(db.query('select path from attachments'));
    // Public editors may keep/remove existing images from another uploader.
    await db.exec(`update requirements set attachments=${value([ref(attachment2)])} where id='${legacy.id}'`);
    assert.equal((await db.query(`select attachments_id from requirements where id='${legacy.id}'`)).rows[0].attachments_id,attachment2);
    assert.equal((await db.query('select id from attachments')).rows.length,1);
    assert.deepEqual((await db.query(`select attachment_urls from requirement_listing where id='${legacy.id}'`)).rows[0].attachment_urls,[]);
    assert.deepEqual((await db.query(`select roava_requirement_attachment_urls(${value([ref(attachment)])}) as urls`)).rows[0].urls,[]);
    await assert.rejects(db.exec(`update requirements set attachments=${value([ref(attachment),ref(attachment2)])} where id='${legacy.id}'`));
    await db.exec(`update requirements set attachments='[]'::jsonb where id='${legacy.id}'`);
    const cleared=(await db.query(`select attachments_id,attachments_profiles_id from requirements where id='${legacy.id}'`)).rows[0];
    assert.equal(cleared.attachments_id,null); assert.equal(cleared.attachments_profiles_id,null);
    assert.equal((await db.query('select id from attachments')).rows.length,0);
  } finally { await db.close(); }
});

test('image endpoint checks requirement access and immutable R2 owner before serving a linked image', async () => {
  const files = new Map();
  const storage = {write:async(key,body,meta)=>files.set(key,{body,...meta}),read:async key=>files.get(key)};
  const media = new MediaStorageService(storage);
  await media.save(new Uint8Array([1,2,3]),{ownerId:testOwner,contentType:'image/png',fileName:'test.png'},attachment);
  await media.save(new Uint8Array([4,5,6]),{ownerId:testOwner,contentType:'image/png',fileName:'second.png'},attachment2);
  let owner = testOwner, hidden = false;
  const fetcher = async url => {
    const u = new URL(url);
    if(u.pathname==='/auth/v1/user') return Response.json({id:testOwner});
    if(u.pathname.endsWith('/requirements')) return Response.json(hidden?[]:[{id:requirement,attachments_id:attachment,attachments_profiles_id:owner,attachments:[{id:attachment,profiles_id:owner},{id:attachment2,profiles_id:owner}]}]);
    if(u.pathname.endsWith('/attachments')) return Response.json([{id:attachment,profiles_id:owner}]);
    throw Error('Unexpected URL');
  };
  const send=(path='image')=>handleAuthenticatedApi(new Request(`https://app.test/api/requirements/${requirement}/${path}`,{headers:{authorization:'Bearer token'}}),()=>storage,testEnv,fetcher);
  let response=await send(); assert.equal(response.status,200); assert.equal(response.headers.get('content-type'),'image/png');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[1,2,3]);
  response=await send(`images/${attachment2}`); assert.equal(response.status,200);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[4,5,6]);
  assert.equal((await send(`images/${crypto.randomUUID()}`)).status,404);
  assert.equal((await send(`images/${attachment2}?profile=${other}`)).status,404);
  owner=other; assert.equal((await send()).status,404);
  owner=testOwner; hidden=true; assert.equal((await send()).status,404);
});

test('requirement writes accept only ready requirement images from the uploader and ignore forged profile IDs', async () => {
  let missing = false, existingImages=[];
  const writes = [];
  const fetcher = async (url,options={}) => {
    const u = new URL(url), table=u.pathname.split('/').at(-1);
    if(u.pathname==='/auth/v1/user') return Response.json({id:testOwner});
    if(options.method==='POST' || options.method==='PATCH') { const data=JSON.parse(options.body); writes.push(data); return Response.json([{id:requirement,...data}]); }
    if(table.startsWith('master_')) return Response.json([{code:'FEATURE'}]);
    if(table==='requirements') return Response.json([{id:requirement,attachments:existingImages}]);
    if(table==='attachments') {
      assert.equal(u.searchParams.get('profiles_id'),`eq.${testOwner}`);
      assert.equal(u.searchParams.get('type'),'eq.requirement');
      assert.equal(u.searchParams.get('status'),'eq.ready');
      return Response.json(missing?[]:[{id:attachment,mime_type:'image/png'}]);
    }
    throw Error('Unexpected URL');
  };
  const send=(body,auth=true,method='POST')=>handleAuthenticatedApi(new Request(`https://app.test/api/requirements${method==='PATCH'?`/${requirement}`:''}`,{method,headers:{'content-type':'application/json',...(auth?{authorization:'Bearer token'}:{})},body:JSON.stringify({title:'with image',...body})}),()=>{throw Error('Should not access R2');},testEnv,fetcher);
  assert.equal((await send({attachments_id:attachment,attachments_profiles_id:other})).status,201);
  assert.equal(writes.at(-1).attachments_profiles_id,testOwner);
  missing=true; assert.equal((await send({attachments_id:attachment})).status,422);
  for(const value of [23,'bad',{},'x'.repeat(129)]) assert.equal((await send({attachments_id:value})).status,422);
  assert.equal((await send({attachments_id:attachment},false)).status,422);
  assert.equal((await send({attachments_id:null},false)).status,201);
  assert.equal(Object.hasOwn(writes.at(-1),'attachments_profiles_id'),false);
  missing=false;
  const refs=[{id:attachment,profiles_id:testOwner},{id:attachment2,profiles_id:testOwner}];
  assert.equal((await send({attachments:refs})).status,201);
  assert.deepEqual(writes.at(-1).attachments,refs);
  for(const images of [null,{},[{}],[{id:'invalid'}],[refs[0],refs[0]],Array(21).fill(refs[0]),[{id:attachment,profiles_id:other}]]) {
    assert.equal((await send({attachments:images})).status,422);
  }
  assert.equal((await send({attachments:refs,attachments_id:attachment})).status,422);
  missing=true; assert.equal((await send({attachments:refs})).status,422);
  assert.equal((await send({attachments:refs},false)).status,422);
  // A shared editor retains another uploader's references but cannot add private images.
  existingImages=refs;
  assert.equal((await send({attachments:[refs[1]]},false,'PATCH')).status,200);
  assert.deepEqual(writes.at(-1).attachments,[refs[1]]);
  assert.equal((await send({attachments:[]},false,'PATCH')).status,200);
});

test('UI appends multiple images, retries partial uploads without duplicates, preserves a failed save and removes images individually', async () => {
  const source=ts.transpileModule(await readFile(new URL('../src/app/features/requirements/requirements.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
  const signal=value=>Object.assign(()=>value,{set:next=>{value=next;}});
  class SupabaseService {} class ApiMediaStorage {}
  let uploads=0,reject=true,failSecond=true; const revoked=[]; let saved=[];
  const media={save:async(file,trip,place,type)=>{assert.equal(type,'requirement');uploads++;
    if(file.name==='second.png' && failSecond) throw Error('upload failed');
    return {id:file.name==='second.png'?attachment2:attachment};}};
  const auth={initialized:Promise.resolve(),user:()=>({id:testOwner}),token:async()=>'token'};
  const exports={};
  class TestURL extends URL { static createObjectURL(){return 'blob:test';} static revokeObjectURL(value){revoked.push(value);} }
  const fetcher=async(url,options={})=>{
    if(url.includes('masters/')) return Response.json([]);
    if(url.includes('requirements?')) return Response.json({items:[],pagination:{total:0,total_pages:0}});
    if(options.method==='POST' || options.method==='PATCH') {
      if(reject) return Response.json({error:'retry'},{status:500});
      saved=JSON.parse(options.body).attachments;
    }
    if(url.includes('/images/')) return new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}});
    return Response.json({id:requirement,title:'image',requirement_type:'FEATURE',priority:'MEDIUM',status:'PENDING',attachments:saved,prs:[]});
  };
  vm.runInNewContext(source,{exports,Error,URL:TestURL,URLSearchParams,AbortSignal,fetch:fetcher,setTimeout:fn=>fn(),require:name=>name==='@angular/core'?{Component:()=>()=>{},ViewChild:()=>()=>{},signal,inject:type=>type===ApiMediaStorage?media:auth}:name.includes('api-media.storage')?{ApiMediaStorage}:name.includes('supabase.service')?{SupabaseService}:name==='@angular/common'?{DatePipe:class{}}:{FormsModule:class{}}});
  const ui=new exports.Requirements(); await ui.initialize(); ui.create(); ui.form.title='image';
  const input={files:[{name:'test.png',size:12,type:'image/png'}],value:'selected'};
  ui.chooseImage({target:input}); assert.equal(input.value,''); assert.equal(ui.images()[0].url,'blob:test');
  ui.chooseImage({target:{files:[{name:'second.png',size:12,type:'image/png'}],value:''}});
  assert.equal(ui.images().length,2);
  await ui.save(); assert.equal(uploads,2); assert.equal(ui.images()[0].id,attachment); assert.equal(ui.formError(),'upload failed');
  failSecond=false; await ui.save(); assert.equal(uploads,3); assert.equal(ui.form.attachments.length,2); assert.equal(ui.formError(),'retry');
  reject=false; await ui.save(); assert.equal(uploads,3); assert.equal(ui.formError(),''); assert.equal(ui.images().length,2);
  ui.removeImage(ui.images()[0].key); assert.equal(ui.images().length,1); assert.equal(ui.images()[0].id,attachment2);
  await ui.save(); assert.equal(uploads,3); assert.equal(saved.length,1); assert.equal(saved[0].id,attachment2);
  ui.chooseImage({target:{files:Array.from({length:20},()=>({name:'extra.png',size:12,type:'image/png'})),value:''}});
  assert.equal(ui.images().length,1); assert.ok(ui.imageError());
  ui.ngOnDestroy(); assert.ok(revoked.includes('blob:test'));
});
