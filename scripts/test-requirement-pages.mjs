import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';
import { DatePipe } from '@angular/common';

const read = path => fs.readFileSync(path, 'utf8');

test('requirement timestamps use English months, a 24-hour clock and the Thai time suffix', () => {
  const template = read('src/app/features/requirements/requirements.html');
  assert.equal(parseTemplate(template, 'requirements.html').errors, null);
  const timestamps = [...template.matchAll(/{{\s*((?:item|record)\.(?:created_at|modified_at))\s*\| date:'([^']+)':undefined:'([^']+)'\s*}} (น\.)/g)];
  assert.deepEqual(timestamps.map(match => match[1]).sort(), ['item.created_at', 'record.created_at', 'record.modified_at']);
  for (const [, field, format, locale, suffix] of timestamps) {
    // A different injected locale must not change the requested English month.
    const pipe = new DatePipe('th-TH');
    for (const [hour, minute, expected] of [[13, 20, '01-Jul-2026 13:20 น.'], [0, 5, '01-Jul-2026 00:05 น.'], [23, 59, '01-Jul-2026 23:59 น.']]) {
      const value = new Date(2026, 6, 1, hour, minute, 47);
      assert.equal(`${pipe.transform(value, format, undefined, locale)} ${suffix}`, expected, field);
    }
  }
});
const transpile = path => ts.transpileModule(read(path), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true,
} }).outputText;

function fixture(editor = false, id = null) {
  class ActivatedRoute {} class Router {} class SupabaseService {} class ApiMediaStorage {}
  const calls = [], navigations = [];
  const record = { id: 'record-1', title: 'Existing', description: '', requirement_type: 'FEATURE', priority: 'MEDIUM', status: 'PENDING', attachments: [], prs: [] };
  const route = { snapshot: { data: { editor }, paramMap: { get: () => id } } };
  const router = { navigate: async path => { navigations.push(path); return true; } };
  const auth = { initialized: Promise.resolve(), user: () => null };
  const signal = value => Object.assign(() => value, { set: next => { value = next; } });
  const exports = {};
  vm.runInNewContext(transpile('src/app/features/requirements/requirements.ts'), {
    exports, URL, URLSearchParams, setTimeout: fn => fn(),
    fetch: async (url, options) => {
      calls.push({ url, method: options.method });
      if (url.includes('masters/')) return Response.json([]);
      if (url.includes('requirements?')) return Response.json({ items: [], pagination: { total: 0, total_pages: 0 } });
      return Response.json(record);
    },
    require: name => {
      if (name === '@angular/core') return { Component: () => () => {}, ViewChild: () => () => {}, signal,
        inject: type => type === ActivatedRoute ? route : type === Router ? router : type === SupabaseService ? auth : {} };
      if (name === '@angular/router') return { ActivatedRoute, Router, RouterLink: class {} };
      if (name.includes('supabase.service')) return { SupabaseService };
      if (name.includes('api-media.storage')) return { ApiMediaStorage };
      return {};
    },
  });
  const ui = new exports.Requirements();
  return { ui, calls, navigations, record, ready: () => new Promise(resolve => setImmediate(resolve)) };
}

// Resolve Angular control flow to check which top-level UI sections are reachable.
function visibleElements(ui) {
  const parsed = parseTemplate(read('src/app/features/requirements/requirements.html'), 'requirements.html');
  assert.equal(parsed.errors, null);
  const elements = [];
  const evaluate = (expression, scope) => vm.runInNewContext(`with (scope) { (${expression}) }`, { scope });
  const visit = (nodes, scope = ui) => {
    for (const node of nodes) {
      if (node.constructor.name === 'IfBlock') {
        const branch = node.branches.find(branch => !branch.expression || evaluate(branch.expression.source, scope));
        if (branch) {
          const childScope = Object.create(scope);
          if (branch.expressionAlias) childScope[branch.expressionAlias.name] = evaluate(branch.expression.source, scope);
          visit(branch.children, childScope);
        }
      } else if (node.name) {
        elements.push(node);
        visit(node.children ?? [], scope);
      }
    }
  };
  visit(parsed.nodes);
  return elements;
}
const hasAttribute = (elements, name, value) => elements.some(el => el.attributes?.some(attr => attr.name === name && attr.value === value));

test('list route shows search and results without the editor; actions navigate to separate pages', async () => {
  const f = fixture(); await f.ready();
  assert.equal(f.ui.lookupReady(), true);
  assert.ok(f.calls.some(call => call.url.includes('requirements?')));
  let elements = visibleElements(f.ui);
  assert.ok(elements.some(el => el.name === 'form'));
  assert.equal(hasAttribute(elements, 'aria-labelledby', 'editor-title'), false);
  f.ui.filters.search = 'mobile'; f.ui.filters.status = 'PENDING';
  await f.ui.load(1);
  assert.ok(f.calls.at(-1).url.includes('search=mobile'));
  assert.ok(f.calls.at(-1).url.includes('status=PENDING'));
  f.ui.create(); await f.ui.edit('record-1');
  assert.deepEqual(JSON.parse(JSON.stringify(f.navigations)), [['/requirements/new'], ['/requirements', 'record-1']]);
  assert.equal(f.ui.editing(), false);
});

test('add route displays a blank form immediately, excludes filters/results, saves and keeps related PRs available', async () => {
  const f = fixture(true);
  assert.equal(f.ui.editing(), true);
  await f.ready();
  const elements = visibleElements(f.ui);
  assert.ok(hasAttribute(elements, 'aria-labelledby', 'editor-title'));
  assert.equal(elements.some(el => el.attributes?.some(attr => attr.name === 'class' && attr.value.includes('filters'))), false);
  assert.equal(elements.some(el => el.name === 'table'), false);
  assert.equal(f.calls.some(call => call.url.includes('requirements?')), false);
  f.ui.form.title = 'New'; await f.ui.save();
  assert.ok(f.calls.some(call => call.method === 'POST' && call.url === '/api/requirements'));
  assert.equal(f.ui.detail().id, 'record-1');
  f.ui.openPR(); await f.ui.savePR();
  assert.ok(f.calls.some(call => call.url === '/api/requirements/record-1/prs' && call.method === 'POST'));
  assert.equal(f.calls.some(call => call.url.includes('requirements?')), false);
  f.ui.prSaving.set(true); f.ui.cancel(); assert.equal(f.navigations.length, 0);
  f.ui.prSaving.set(false); f.ui.cancel();
  assert.equal(f.navigations[0][0], '/requirements');
  f.ui.create(); assert.equal(f.ui.detail(), null); assert.equal(f.ui.form.title, '');
});

test('direct edit route loads the requested record and updates it without loading the list', async () => {
  const f = fixture(true, 'record-1'); await f.ready();
  assert.equal(f.ui.form.title, 'Existing');
  f.ui.create(); assert.equal(f.navigations.at(-1)[0], '/requirements/new');
  assert.ok(hasAttribute(visibleElements(f.ui), 'aria-labelledby', 'editor-title'));
  await f.ui.save();
  assert.ok(f.calls.some(call => call.url === '/api/requirements/record-1' && call.method === 'PATCH'));
  assert.equal(f.calls.some(call => call.url.includes('requirements?')), false);
});

test('routes and toolbar expose both views; anonymous entry recognizes all requirement pages', () => {
  const routes = {};
  vm.runInNewContext(transpile('src/app/app.routes.ts'), { exports: routes });
  assert.deepEqual(Array.from(routes.routes.slice(0, 3), route => route.path), ['requirements/new', 'requirements/:id', 'requirements']);
  const parsed = parseTemplate(read('src/app/app.html'), 'app.html');
  assert.equal(parsed.errors, null);
  const nav = parsed.nodes.find(node => node.name === 'header').children.find(node => node.name === 'nav');
  assert.ok(hasAttribute(nav.children, 'routerLink', '/requirements'));
  assert.ok(hasAttribute(nav.children, 'routerLink', '/requirements/new'));
  const exports = {};
  vm.runInNewContext(transpile('src/app/app.ts'), { exports, require: name => name === '@angular/core' ? { Component: () => () => {} } : {} });
  for (const url of ['/requirements', '/requirements/new', '/requirements/record-1?x=1', '/requirements/new/#title']) {
    assert.equal(exports.App.prototype.anonymousRequirements.call({ router: { url } }), true, url);
  }
  assert.equal(exports.App.prototype.anonymousRequirements.call({ router: { url: '/trips' } }), false);
});
