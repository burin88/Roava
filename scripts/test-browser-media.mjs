import fs from 'node:fs';
import vm from 'node:vm';
import { File } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import ts from 'typescript';

const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,experimentalDecorators:true}}).outputText;
const js=compile('src/app/core/storage/indexeddb-media.storage.ts');
function fixture(extra={}) {
  const exports={};
  vm.runInNewContext(js,{exports,indexedDB:new IDBFactory(),crypto:webcrypto,setTimeout,clearTimeout,Error,
    require:name=>name==='@angular/core'?{Injectable:()=>target=>target}:{},...extra,
  });
  return {create:()=>new exports.IndexedDbMediaStorage()};
}
const image=()=>new File(['original receipt image'],'receipt.jpg',{type:'image/jpeg',lastModified:Date.now()});

test('legacy browser photos remain readable across storage instances',async()=>{
  const f=fixture({fetch:()=>{throw new Error('Legacy storage must not call a media API');}});
  const storage=f.create();
  const saved=await storage.save(image(),'trip','place');
  assert.equal(storage.location,'browser');
  assert.equal(saved.tripId,'trip');assert.equal(saved.placeId,'place');
  const reloaded=await f.create().getRecord(saved.id);
  assert.equal(reloaded.fileName,'receipt.jpg');
  assert.equal(await (await f.create().get(saved.id)).text(),'original receipt image');
  await storage.delete(saved.id);assert.equal(await storage.getRecord(saved.id),null);
});
test('mobile images that cannot be decoded as thumbnails still save their originals',async()=>{
  const storage=fixture({createImageBitmap:async()=>{throw new Error('HEIC decoding unavailable');}}).create();
  const saved=await storage.save(new File(['original HEIC'],'receipt.heic',{type:'image/heic'}),'trip');
  assert.equal(await (await storage.get(saved.id)).text(),'original HEIC');
});
test('a failed transaction rejects even after the put request itself has succeeded',async()=>{
  const storage=fixture().create();const originalOpen=storage.open.bind(storage);
  storage.open=async()=>{
    const db=await originalOpen();const createTransaction=db.transaction.bind(db);
    db.transaction=(...args)=>{
      const transaction=createTransaction(...args);const getStore=transaction.objectStore.bind(transaction);
      transaction.objectStore=name=>{const store=getStore(name);const put=store.put.bind(store);store.put=value=>{const request=put(value);request.onsuccess=()=>transaction.abort();return request;};return store;};
      return transaction;
    };return db;
  };
  await assert.rejects(storage.save(image(),'trip'),/ยกเลิก|abort/i);
});
test('quota failure gives a useful message and does not claim a successful save',async()=>{
  const storage=fixture().create();
  const error=new Error('quota');error.name='QuotaExceededError';
  storage.open=async()=>({transaction:()=>{throw error;},close:()=>{}});
  await assert.rejects(storage.save(image(),'trip'),/พื้นที่เก็บรูปในอุปกรณ์เต็ม/);
});
test('blocked or disabled storage fails clearly rather than leaving Save running',async()=>{
  const blocked={open:()=>{const request={};queueMicrotask(()=>request.onblocked());return request;}};
  await assert.rejects(fixture({indexedDB:blocked}).create().save(image(),'trip'),/แท็บอื่น/);
  await assert.rejects(fixture({indexedDB:undefined}).create().save(image(),'trip'),/ไม่รองรับคลังรูป/);
});
test('production and development both provide API-backed media storage',()=>{
  for(const development of [false,true]) {
    class Browser{}class Files{}class Media{}
    const exports={};
    vm.runInNewContext(compile('src/app/app.config.ts'),{exports,require:name=>{
      if(name==='@angular/core')return{inject:token=>token,isDevMode:()=>development,provideBrowserGlobalErrorListeners:()=>({})};
      if(name==='@angular/router')return{provideRouter:()=>({}),withInMemoryScrolling:()=>({})};
      if(name.endsWith('/indexeddb-media.storage'))return{IndexedDbMediaStorage:Browser};
      if(name.endsWith('/api-media.storage'))return{ApiMediaStorage:Files};
      if(name.endsWith('/media-storage'))return{MediaStorage:Media};
      return{};
    }});
    const provider=exports.appConfig.providers.find(provider=>provider?.provide===Media);
    assert.equal(provider.useExisting,Files);
    assert.equal(provider.useFactory,undefined);
  }
});
