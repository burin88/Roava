import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const js=ts.transpileModule(fs.readFileSync('src/app/core/storage/api-media.storage.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true},
}).outputText;
function storageWith(fetch) {
  const exports={};
  vm.runInNewContext(js,{exports,fetch,Headers,AbortController,setTimeout,clearTimeout,Error,TypeError,SyntaxError,
    require:name=>name==='@angular/core'?{Injectable:()=>target=>target,inject:()=>({token:async()=> 'test-token'})}:{},
  });
  return new exports.ApiMediaStorage();
}
const file={name:'ใบเสร็จ.jpg',type:'image/jpeg',size:50,lastModified:Date.parse('2026-10-15')};
const response=(status,value)=>({status,ok:status>=200&&status<300,json:async()=>value});

test('upload retains its API contract and returns the saved image record',async()=>{
  let sent;
  const storage=storageWith(async(url,options)=>{sent={url,options};return response(201,{id:'photo',url:'/api/media/photo'});});
  assert.equal((await storage.save(file,'trip','place')).id,'photo');
  assert.equal(sent.url,'/api/media');
  assert.equal(sent.options.body,file);
  assert.equal(decodeURIComponent(sent.options.headers.get('x-file-name')),file.name);
  assert.equal(sent.options.headers.get('x-trip-id'),'trip');
  assert.equal(sent.options.headers.get('authorization'),'Bearer test-token');
  assert.ok(sent.options.signal);
});
test('a server that never responds is aborted and returns a bounded timeout error',async()=>{
  let signal;
  const storage=storageWith(async(_,options)=>{signal=options.signal;return new Promise(()=>{});});
  await assert.rejects(storage.request('/api/media',{},async r=>r.json(),10),/ตอบกลับช้าเกินไป/);
  assert.equal(signal.aborted,true);
});
test('the timeout also covers a response body that never completes',async()=>{
  const storage=storageWith(async()=>({json:()=>new Promise(()=>{})}));
  await assert.rejects(storage.request('/api/media',{},async r=>r.json(),10),/ตอบกลับช้าเกินไป/);
});
test('network failures and unavailable proxy services produce actionable errors',async()=>{
  const disconnected=storageWith(async()=>{throw new TypeError('Failed to fetch');});
  await assert.rejects(disconnected.save(file,'trip'),/ติดต่อเซิร์ฟเวอร์รูปภาพไม่ได้/);
  const unavailable=storageWith(async()=>response(503,{}));
  await assert.rejects(unavailable.save(file,'trip'),/ยังไม่พร้อม/);
});

test('known deployment failures explain which Cloudflare setting is missing without exposing upstream errors',async()=>{
  for(const [code,setting] of [['R2_BINDING_MISSING','R2_STORAGE'],['R2_BUCKET_NAME_MISSING','CLOUDFLARE_R2_BUCKET_NAME']]) {
    const storage=storageWith(async()=>response(503,{code,error:'secret upstream details'}));
    await assert.rejects(storage.save(file,'trip'),error=>error.message.includes(setting)&&!error.message.includes('secret'));
  }
  const storage=storageWith(async()=>response(502,{error:'secret SQL and credentials'}));
  await assert.rejects(storage.save(file,'trip'),error=>error.message.includes('ยังไม่พร้อม')&&!error.message.includes('secret'));
  for(const code of ['R2_OBJECT_WRITE_FAILED','R2_RECORD_WRITE_FAILED','MEDIA_PROFILE_FAILED','MEDIA_METADATA_FAILED']) {
    const failed=storageWith(async()=>response(502,{code,error:'private upstream details'}));
    await assert.rejects(failed.save(file,'trip'),error=>error.message.includes(code)&&!error.message.includes('private'));
  }
});
test('a missing API or HTML response is distinguished from a saved image',async()=>{
  const missing=storageWith(async()=>response(404,{}));
  await assert.rejects(missing.save(file,'trip'),/ไม่พบ API/);
  const html=storageWith(async()=>({ok:true,json:async()=>{throw new SyntaxError('Unexpected token <');}}));
  await assert.rejects(html.save(file,'trip'),/ไม่ใช่ข้อมูลรูปภาพ/);
});
test('oversized files are rejected without uploading and server validation errors survive',async()=>{
  let calls=0;
  const storage=storageWith(async()=>{calls++;return response(415,{error:'Unsupported image type'});});
  await assert.rejects(storage.save({...file,size:26*1024*1024},'trip'),/25 MB/);
  assert.equal(calls,0);
  await assert.rejects(storage.save(file,'trip'),/Unsupported image type/);
});
