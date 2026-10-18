import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';

const source = readFileSync('src/app/app.ts', 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true,
} }).outputText, {
  exports,
  require: name => name === '@angular/core' ? { Component: () => () => {} } : {},
});
const template = parseTemplate(readFileSync('src/app/app.html', 'utf8'), 'app.html');
assert.equal(template.errors, null);

// Evaluate the real Angular template branches without instantiating services,
// loading route components, or making authentication/network requests.
function visible(ui) {
  const names = [];
  const visit = nodes => {
    for (const node of nodes) {
      if (node.constructor.name === 'IfBlock') {
        const branch = node.branches.find(branch => !branch.expression ||
          vm.runInNewContext(`with (ui) { (${branch.expression.source}) }`, { ui }));
        if (branch) visit(branch.children);
      } else if (node.name) {
        names.push(node.name);
        visit(node.children ?? []);
      }
    }
  };
  visit(template.nodes);
  return names;
}
function fixture(url) {
  const state = { ready: true, user: null, error: '' };
  const ui = {
    auth: { ready: () => state.ready, user: () => state.user, configError: () => state.error },
    router: { url }, signOutError: () => '',
    isRequirementsPage: exports.App.prototype.isRequirementsPage,
  };
  return { state, ui };
}
const urls = ['/trips', '/beijing', '/continent/AS', '/country/TH', '/country/CN',
  '/city/TH/BKK', '/requirements', '/requirements/new', '/requirements/record-1?x=1', '/'];

for (const url of urls) {
  test(`signed-out entry to ${url} shows only the sign-in screen`, () => {
    const { ui } = fixture(url);
    assert.deepEqual(visible(ui), ['main', 'app-login']);
  });
}

test('initialization hides all menus and routed content even with a cached user', () => {
  const { ui, state } = fixture('/requirements/new');
  state.ready = false;
  state.user = { id: 'cached-user' };
  assert.deepEqual(visible(ui), ['main', 'p']);
});

test('configuration errors retain recovery UI without exposing anonymous content', () => {
  const { ui, state } = fixture('/requirements');
  state.error = 'Authentication unavailable';
  assert.deepEqual(visible(ui), ['main', 'div', 'button']);
});

for (const url of ['/trips', '/requirements', '/requirements/new', '/requirements/record-1']) {
  test(`sign-in and sign-out update menus and content on ${url}`, () => {
    const { ui, state } = fixture(url);
    state.user = { id: 'signed-in-user' };
    const names = visible(ui);
    assert.ok(names.includes('header'));
    assert.ok(names.includes('nav'));
    assert.equal(names.includes('app-login'), false);
    assert.equal(names.includes('router-outlet'), url.startsWith('/requirements'));
    assert.equal(names.includes('authenticated-workspace'), !url.startsWith('/requirements'));
    state.user = null;
    assert.deepEqual(visible(ui), ['main', 'app-login']);
  });
}
