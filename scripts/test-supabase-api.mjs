import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAuthenticatedApi } from '../server/authenticated-api.mjs';
import { MediaStorageService } from '../server/services/media-storage.service.mjs';
import { publicSupabaseConfig } from '../server/config/supabase-config.mjs';
import { R2BindingStorageService } from '../server/services/r2-binding-storage.service.mjs';
import { supabaseFixture, testEnv, testOwner } from './fixtures/supabase-api.mjs';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const api = supabaseFixture();
  const objects = new Map();
  const storage = {
    async write(key, body, metadata) { objects.set(key,{bytes:body,...metadata}); return {key,...metadata,size:body.length}; },
    async read(key) { const o=objects.get(key); return o ? {...o,body:new Blob([o.bytes]).stream(),size:o.bytes.length} : null; },
    async delete(key) { objects.delete(key); },
  };
  const call = (path, options = {}, authenticated = true) => {
    const headers = new Headers(options.headers);
    if (authenticated) headers.set('authorization','Bearer test-token');
    return handleAuthenticatedApi(new Request(`http://localhost${path}`,{...options,headers}),()=>storage,api.env,api.fetcher);
  };
  return { api, storage, objects, call };
}
test('only public config is exposed; missing config and privileged keys are rejected',async()=>{
  const f=fixture();
  const response=await f.call('/api/config',{},false);
  assert.deepEqual(await response.json(),{url:testEnv.SUPABASE_URL,publishableKey:testEnv.SUPABASE_PUBLISHABLE_KEY});
  assert.throws(()=>publicSupabaseConfig({...testEnv,SUPABASE_PUBLISHABLE_KEY:'sb_secret_never_expose'}));
  assert.throws(()=>publicSupabaseConfig({}));
});
test('anonymous and invalid tokens cannot access R2',async()=>{
  const f=fixture();
  assert.equal((await f.call('/api/media',{},false)).status,401);
  assert.equal((await handleAuthenticatedApi(new Request('http://localhost/api/media',{headers:{authorization:'Bearer invalid'}}),
    ()=>{throw new Error('Must not access R2');},f.api.env,f.api.fetcher)).status,401);
});
test('uploads register owner and expense metadata; forged owner header is overwritten',async()=>{
  const f=fixture();
  const response=await f.call('/api/media',{method:'POST',body:'image',headers:{'content-type':'image/jpeg',
    'x-file-name':'receipt.jpg','x-owner-id':other,'x-attachment-type':'expense'}});
  assert.equal(response.status,201);
  const record=await response.json();
  assert.equal(record.ownerId,testOwner);
  const row=f.api.attachments.get(record.id);
  assert.equal(row.profiles_id,testOwner);
  assert.equal(row.type,'expense'); assert.equal(row.path,record.key); assert.equal(row.bucket,'test-bucket');
});
test('PostgREST 201 return=minimal empty bodies do not fail receipt uploads',async()=>{
  const f=fixture(); const normal=f.api.fetcher;
  const fetcher=async(url,options)=>{
    if (new URL(url).pathname.endsWith('/profiles')) {
      assert.equal(new URL(url).searchParams.get('on_conflict'),'id');
      assert.equal(JSON.parse(options.body).users_id,testOwner);
      assert.equal(JSON.parse(options.body).profiles_id,undefined);
    }
    const response=await normal(url,options);
    return options.method==='POST' && response.ok ? new Response(null,{status:201}) : response;
  };
  const response=await handleAuthenticatedApi(new Request('http://localhost/api/media',{method:'POST',body:'receipt image',
    headers:{authorization:'Bearer test-token','content-type':'image/jpeg','x-attachment-type':'expense'}}),
    ()=>f.storage,f.api.env,fetcher);
  assert.equal(response.status,201);
  const record=await response.json();
  assert.equal(f.api.attachments.get(record.id).type,'expense');
  assert.ok(f.objects.has(record.key));
  assert.ok(f.objects.has(`roava/media/records/${record.id}.json`));
});

test('missing bucket name fails before uploading or registering any metadata',async()=>{
  const f=fixture(); const { CLOUDFLARE_R2_BUCKET_NAME, ...env }=f.api.env;
  const response=await handleAuthenticatedApi(new Request('https://app.test/api/media',{
    method:'POST',body:'receipt',headers:{authorization:'Bearer test-token','content-type':'image/jpeg'},
  }),()=>{throw Error('Must not upload without bucket configuration');},env,f.api.fetcher);
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'R2_BUCKET_NAME_MISSING');
  assert.equal(f.objects.size,0); assert.equal(f.api.attachments.size,0);
});

test('missing or text R2 binding returns an actionable code instead of a generic storage failure',async()=>{
  for(const bucket of [undefined,'my-bucket']) {
    const f=fixture();
    const response=await handleAuthenticatedApi(new Request('https://app.test/api/media',{
      method:'POST',body:'receipt',headers:{authorization:'Bearer test-token','content-type':'image/jpeg'},
    }),()=>new R2BindingStorageService(bucket),f.api.env,f.api.fetcher);
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,'R2_BINDING_MISSING');
    assert.equal(f.api.attachments.size,0);
  }
});

test('R2 failures identify the failed write step and metadata failures roll back the original',async()=>{
  for(const failedStep of ['object','record']) {
    const objects=new Map(); const f=fixture();
    const bucket={
      async get(){return null;},
      async put(key,body){
        if(failedStep==='object'||key.includes('/records/')) throw new Error('private upstream details');
        objects.set(key,body); return {httpEtag:'test'};
      },
      async delete(key){objects.delete(key);},
    };
    const response=await handleAuthenticatedApi(new Request('https://app.test/api/media',{
      method:'POST',body:'receipt',headers:{authorization:'Bearer test-token','content-type':'image/jpeg'},
    }),()=>new R2BindingStorageService(bucket),f.api.env,f.api.fetcher);
    assert.equal(response.status,502);
    const result=await response.json();
    assert.equal(result.code,failedStep==='object'?'R2_OBJECT_WRITE_FAILED':'R2_RECORD_WRITE_FAILED');
    assert.ok(!JSON.stringify(result).includes('private'));
    assert.equal(objects.size,0); assert.equal(f.api.attachments.size,0);
  }
});
test('guessing another owner media UUID cannot grant access via a forged own attachment row',async()=>{
  const f=fixture();
  await new MediaStorageService(f.storage).save(new Uint8Array([1]),{ownerId:other,contentType:'image/jpeg',fileName:'private.jpg'},id);
  f.api.attachments.set(id,{id,status:'ready',profiles_id:testOwner});
  assert.equal((await f.call(`/api/media/${id}`)).status,404);
  f.api.attachments.delete(id);
  assert.equal((await f.call(`/api/media/${id}/meta`)).status,404);
});
test('legacy owner can resolve existing references and backfill actual R2 metadata',async()=>{
  const f=fixture();
  await new MediaStorageService(f.storage).save(new Uint8Array([1]),{contentType:'image/jpeg',fileName:'legacy.jpg'},id);
  f.api.attachments.set(id,{id,status:'missing_metadata',profiles_id:testOwner});
  assert.equal((await f.call(`/api/media/${id}/meta`)).status,200);
  assert.equal(f.api.attachments.get(id).status,'ready');
  assert.match(f.api.attachments.get(id).path,/roava\/media\//);
});
test('database metadata failures clean uploaded originals and records',async()=>{
  const f=fixture(); const normal=f.api.fetcher;
  const fetcher=(url,options)=>url.endsWith('/attachments')?Promise.resolve(new Response(null,{status:500})):normal(url,options);
  const response=await handleAuthenticatedApi(new Request('http://localhost/api/media',{method:'POST',body:'img',
    headers:{authorization:'Bearer test-token','content-type':'image/jpeg'}}),()=>f.storage,f.api.env,fetcher);
  assert.equal(response.status,502); assert.equal(f.objects.size,0);
  assert.equal((await response.json()).code,'MEDIA_METADATA_FAILED');
});
