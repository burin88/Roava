import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const compile = file => ts.transpileModule(fs.readFileSync(file,'utf8'), {
  compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, experimentalDecorators:true },
}).outputText;
const daily = {};
vm.runInNewContext(compile('src/app/core/models/daily-expenses.ts'),{exports:daily});
const {todayInBangkok,expenseTotals,groupTravelDays} = daily;
const plain = value => JSON.parse(JSON.stringify(value));
const expense = (id,amount,spentAt,currency='THB') => ({id,amount,spentAt,currency,type:'Other'});

test('today follows Bangkok midnight instead of UTC and rolls over at month/year boundaries', () => {
  assert.equal(todayInBangkok(new Date('2026-10-15T16:59:59Z')),'2026-10-15');
  assert.equal(todayInBangkok(new Date('2026-10-15T17:00:00Z')),'2026-10-16');
  assert.equal(todayInBangkok(new Date('2026-12-31T18:00:00Z')),'2027-01-01');
});
test('daily sums keep currencies separate, normalize currency codes and retain cents', () => {
  assert.deepEqual(plain(expenseTotals([
    expense('a',.1,'2026-10-15'),expense('b',.2,'2026-10-15',' thb '),expense('c',12.75,'2026-10-15','CNY'),
  ])),[{currency:'CNY',amount:12.75},{currency:'THB',amount:.3}]);
});
test('an expense date gets a daily card even without any places or outside the trip period', () => {
  const groups = groupTravelDays({places:[{visitedAt:'2026-10-29'}],expenses:[expense('a',150,'2026-10-15')]});
  assert.deepEqual(Array.from(groups,group=>group.date),['2026-10-15','2026-10-29']);
  assert.equal(groups[0].places.length,0);
  assert.equal(groups[0].totals[0].amount,150);
  assert.equal(groups[1].totals.length,0);
});
test('legacy undated expenses stay in an undated card instead of being assigned to today', () => {
  const groups = groupTravelDays({places:[],expenses:[expense('a',200,undefined)]});
  assert.equal(groups[0].date,'');
  assert.equal(groups[0].totals[0].amount,200);
});

// Exercise actual form methods without instantiating browser services.
const componentExports = {};
vm.runInNewContext(compile('src/app/features/cities/city-memory/city-memory.ts'),{
  exports:componentExports,crypto:webcrypto,structuredClone,URL,Error,
  require:name=>name.endsWith('/daily-expenses') ? daily : name==='@angular/core' ? {Component:()=>target=>target} : {},
});
const {CityMemory} = componentExports;
const signal = initial => {let value=initial; const read=()=>value; read.set=next=>{value=next;}; read.update=fn=>{value=fn(value);}; return read;};
function controller() {
  const page = Object.create(CityMemory.prototype);
  let trip = {id:'test',startDate:'2026-10-29',endDate:'2026-11-04',places:[{id:'p',visitedAt:'2026-10-29'}],expenses:[]};
  page.selectedTrip=()=>trip;
  page.store={save:async next=>{trip=next;}};
  page.expenseCategoryQuery=signal('');page.expenseCategoryOpen=signal(false);page.expenseEditorOpen=signal(false);
  page.collapsedPlaceDays=signal(new Set(['2026-10-15','2026-10-30']));
  page.expensePhotoLoadId=0;page.expensePendingPhotos=[];page.expenseExistingPhotos=[];page.expenseRemovedMediaIds=new Set();
  page.expensePhotoBusy=false;page.expensePhotoError='';page.receiptGallery=signal(null);page.photoError=signal('');
  trip.mediaIds=[];page.media={getRecord:async()=>null,delete:async()=>{}};
  page.flash=()=>{};
  page.changeDetector={markForCheck:()=>{page.renderRequests=(page.renderRequests??0)+1;}};
  return page;
}
test('Add the cost defaults to today rather than the selected trip start date; editing keeps its date', () => {
  const page=controller();
  page.openExpense();
  assert.equal(page.expenseModel.spentAt,todayInBangkok());
  page.openExpense(expense('existing',150,'2026-10-01'));
  assert.equal(page.expenseModel.spentAt,'2026-10-01');
});
test('saving, editing its amount/date, and deleting update the actual daily card data', async () => {
  const page=controller();
  page.openExpense();Object.assign(page.expenseModel,{amount:125.5,spentAt:'2026-10-15'});
  await page.saveExpense();
  let groups=page.placeDayGroups(page.selectedTrip());
  assert.equal(groups.find(group=>group.date==='2026-10-15').totals[0].amount,125.5);
  assert.equal(page.collapsedPlaceDays().has('2026-10-15'),false);
  page.openExpense(page.selectedTrip().expenses[0]);
  Object.assign(page.expenseModel,{amount:300.25,spentAt:'2026-10-30'});
  await page.saveExpense();
  groups=page.placeDayGroups(page.selectedTrip());
  assert.equal(groups.some(group=>group.date==='2026-10-15'),false);
  assert.equal(groups.find(group=>group.date==='2026-10-30').totals[0].amount,300.25);
  assert.equal(page.selectedTrip().expenses.length,1);
  assert.equal(page.collapsedPlaceDays().has('2026-10-30'),false);
  await page.deleteExpense(page.selectedTrip().expenses[0]);
  assert.equal(page.placeDayGroups(page.selectedTrip()).some(group=>group.date==='2026-10-30'),false);
});

test('multiple receipt uploads are linked to their expense and the journey gallery', async () => {
  const page=controller();let sequence=0;
  page.media.save=async()=>({id:`receipt-${++sequence}`});
  page.openExpense();
  page.expensePendingPhotos=[{file:{name:'a.jpg'},url:'blob:a'},{file:{name:'b.jpg'},url:'blob:b'}];
  page.expenseModel.amount=450;
  await page.saveExpense();
  assert.deepEqual(plain(page.selectedTrip().expenses[0].mediaIds),['receipt-1','receipt-2']);
  assert.deepEqual(plain(page.selectedTrip().mediaIds),['receipt-1','receipt-2']);
  assert.equal(page.expensePendingPhotos.length,0);
  assert.equal(page.expensePhotoBusy,false);
  assert.equal(page.expenseEditorOpen(),false);
});

test('canceling staged receipt removal leaves the original receipt and files untouched', async () => {
  const page=controller();const removed=[];page.media.delete=async id=>removed.push(id);
  const original={...expense('existing',100,'2026-10-15'),mediaIds:['old']};
  page.selectedTrip().expenses=[original];page.selectedTrip().mediaIds=['old'];
  page.openExpense(original);
  page.removeExistingExpensePhoto({id:'old',url:'/receipt.jpg',objectUrl:false});
  page.closeExpenseEditor();
  assert.deepEqual(original.mediaIds,['old']);
  assert.deepEqual(page.selectedTrip().mediaIds,['old']);
  assert.equal(removed.length,0);
});

test('partial upload failure rolls back uploaded files and preserves the draft for retry', async () => {
  const page=controller();const removed=[];let uploads=0;
  page.media.save=async()=>{if(++uploads===2)throw new Error('Upload failed');return{id:'partial'};};
  page.media.delete=async id=>removed.push(id);
  page.openExpense();page.expensePendingPhotos=[{file:{},url:'blob:a'},{file:{},url:'blob:b'}];
  await page.saveExpense();
  assert.deepEqual(removed,['partial']);
  assert.equal(page.selectedTrip().expenses.length,0);
  assert.equal(page.expensePendingPhotos.length,2);
  assert.equal(page.expenseEditorOpen(),true);
  assert.equal(page.expensePhotoBusy,false);
  assert.match(page.expensePhotoError,/Upload failed/);
  assert.ok(page.renderRequests > 0, 'Async failure must update the zoneless Angular view');
});

test('failed expense persistence does not delete old receipts and rolls back only new uploads', async () => {
  const page=controller();const removed=[];
  const original={...expense('existing',100,'2026-10-15'),mediaIds:['old']};
  page.selectedTrip().expenses=[original];page.selectedTrip().mediaIds=['old'];
  page.media.save=async()=>({id:'new'});page.media.delete=async id=>removed.push(id);
  page.store.save=async()=>{throw new Error('Storage full');};
  page.openExpense(original);page.expenseRemovedMediaIds.add('old');
  page.expensePendingPhotos=[{file:{},url:'blob:new'}];
  await page.saveExpense();
  assert.deepEqual(removed,['new']);
  assert.deepEqual(original.mediaIds,['old']);
  assert.match(page.expensePhotoError,/Storage full/);
});

test('removing receipts preserves shared files and deletes unreferenced files after persistence', async () => {
  const page=controller();const operations=[];
  const original={...expense('existing',100,'2026-10-15'),mediaIds:['shared','exclusive']};
  page.selectedTrip().places[0].mediaIds=['shared'];
  page.selectedTrip().expenses=[original];page.selectedTrip().mediaIds=['shared','exclusive'];
  const save=page.store.save;
  page.store.save=async trip=>{await save(trip);operations.push('saved');};
  page.media.delete=async id=>operations.push(`deleted:${id}`);
  page.openExpense(original);page.expenseRemovedMediaIds.add('shared');page.expenseRemovedMediaIds.add('exclusive');
  await page.saveExpense();
  assert.deepEqual(operations,['saved','deleted:exclusive']);
  assert.deepEqual(plain(page.selectedTrip().mediaIds),['shared']);
  assert.equal(page.selectedTrip().expenses[0].mediaIds.length,0);
});
