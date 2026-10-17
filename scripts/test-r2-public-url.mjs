import test from 'node:test';
import assert from 'node:assert/strict';
import { r2PublicObjectUrl } from '../server/config/r2-public-url.mjs';
import { handleAuthenticatedApi } from '../server/authenticated-api.mjs';
import { supabaseFixture } from './fixtures/supabase-api.mjs';

test('public R2 URLs are optional, preserve the full key and encode object names',()=>{
  assert.equal(r2PublicObjectUrl('', 'roava/media/test.png'),null);
  assert.equal(r2PublicObjectUrl('https://images.example.com/','roava/media/รูป test#1.png'),'https://images.example.com/roava/media/%E0%B8%A3%E0%B8%B9%E0%B8%9B%20test%231.png');
  assert.equal(r2PublicObjectUrl('https://pub-example.r2.dev','roava/media/test.png'),'https://pub-example.r2.dev/roava/media/test.png');
  for(const base of ['http://example.com','https://user:pass@example.com','https://example.com?key=secret','https://example.com/#hash','https://account.r2.cloudflarestorage.com','invalid']) assert.throws(()=>r2PublicObjectUrl(base,'image.png'));
  assert.throws(()=>r2PublicObjectUrl('https://images.example.com','../private.json'));
});

test('requirement uploads save their public URL; invalid domains fail before upload',async()=>{
  const f=supabaseFixture(); let writes=0;
  const storage={write:async()=>{writes++;},delete:async()=>{}};
  const request=()=>new Request('https://app.test/api/media',{method:'POST',headers:{authorization:'Bearer test-token','content-type':'image/png','x-file-name':'image.png','x-attachment-type':'requirement'},body:new Uint8Array([1,2,3])});
  const env={...f.env,R2_PUBLIC_BASE_URL:'https://images.example.com'};
  const response=await handleAuthenticatedApi(request(),()=>storage,env,f.fetcher);
  assert.equal(response.status,201);
  const record=await response.json();
  assert.equal(f.attachments.get(record.id).url,`https://images.example.com/${record.key}`);
  const count=writes;
  assert.equal((await handleAuthenticatedApi(request(),()=>storage,{...env,R2_PUBLIC_BASE_URL:'https://account.r2.cloudflarestorage.com'},f.fetcher)).status,503);
  assert.equal(writes,count);
});
