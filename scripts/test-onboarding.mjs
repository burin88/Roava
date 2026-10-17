import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    experimentalDecorators: true,
  },
}).outputText;

function fixture(pathname, previouslyVisited) {
  const rendered = [];
  const effects = [];
  const navigations = [];
  const tours = [];
  const cleanup = [];
  const stored = new Map(previouslyVisited ? [['atlas-showcase-onboarding-v1', '1']] : []);
  const router = { navigate: async route => { navigations.push(route); }, url: pathname };
  let service;
  let onboardingInjections = 0;
  const core = {
    Component: () => target => target,
    Injectable: () => target => target,
    DestroyRef: class DestroyRef {},
    signal: initial => {
      let value = initial;
      const read = () => value;
      read.set = next => { value = next; };
      return read;
    },
    effect: callback => effects.push(callback),
    afterNextRender: callback => rendered.push(callback),
    inject: token => token === core.DestroyRef ? { onDestroy: callback => cleanup.push(callback) }
      : token === OnboardingTourService ? (onboardingInjections++, service)
      : token === Router ? router : {},
  };
  class Router {}
  const context = {
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    window: { location: { pathname } },
    document: {
      documentElement: { setAttribute() {}, style: {} },
      querySelector: () => ({}),
    },
    performance,
    require: name => {
      if (name === '@angular/core') return core;
      if (name === '@angular/router') return { Router };
      if (name.endsWith('/onboarding-tour.service')) return { OnboardingTourService };
      if (name === 'driver.js') return {
        driver: options => {
          const tour = { drives: 0, drive() { this.drives++; }, destroy: () => options.onDestroyed() };
          tours.push(tour);
          return tour;
        },
      };
      return {};
    },
  };
  const serviceExports = {};
  vm.runInNewContext(compile('src/app/shared/onboarding/onboarding-tour.service.ts'), { ...context, exports: serviceExports });
  const { OnboardingTourService } = serviceExports;
  service = new OnboardingTourService();
  const appExports = {};
  vm.runInNewContext(compile('src/app/app.ts'), { ...context, exports: appExports });
  const app = new appExports.App();
  return {
    app, service, tours, navigations,
    get onboardingInjections() { return onboardingInjections; },
    render() { effects.forEach(callback => callback()); rendered.forEach(callback => callback()); },
    destroy() { cleanup.forEach(callback => callback()); },
  };
}

for (const previouslyVisited of [false, true]) {
  test(`${previouslyVisited ? 'returning' : 'first-time'} visitor cannot start onboarding explicitly`, async () => {
    const f = fixture('/beijing', previouslyVisited);
    await f.service.start();
    await f.service.start();
    f.render();
    assert.equal(f.tours.length, 0, 'Explicit starts must never create a tour');
    assert.equal(f.navigations.length, 0, 'Explicit starts must preserve the current page');
    f.destroy();
  });

  for (const path of ['/', '/trips', '/beijing', '/continent/AS', '/requirements']) {
    test(`${previouslyVisited ? 'returning' : 'first-time'} visit to ${path} does not launch onboarding or navigate`, async () => {
      const f = fixture(path, previouslyVisited);
      f.render();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.onboardingInjections, 0);
      assert.equal(f.tours.length, 0);
      assert.equal(f.navigations.length, 0);
    });
  }
}

test('disabled onboarding starts without accessing browser APIs or storage', async () => {
  const exports = {};
  const context = {
    exports,
    require: name => {
      assert.equal(name, '@angular/core', 'Disabled onboarding must not load tour dependencies');
      return { Injectable: () => target => target };
    },
  };
  for (const name of ['window', 'document', 'localStorage', 'sessionStorage']) {
    Object.defineProperty(context, name, {
      get() { assert.fail(`Disabled onboarding must not access ${name}`); },
    });
  }
  vm.runInNewContext(compile('src/app/shared/onboarding/onboarding-tour.service.ts'), context);
  const service = new exports.OnboardingTourService();
  await service.start();
  await service.start();
});

test('How to use button remains visible and natively disabled without an onboarding action', () => {
  const template = fs.readFileSync('src/app/app.html', 'utf8');
  const button = template.match(/<button\b[^>]*aria-label="[^"]+"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button, 'The How to use button must remain in the template');
  assert.match(button, /aria-label="เปิดคำแนะนำการใช้งาน"/);
  assert.match(button, /วิธีใช้/);
  assert.match(button, /^<button\b[^>]*\sdisabled(?:\s|>)/, 'Native disabled state must prevent activation');
  assert.doesNotMatch(button, /\([^)]*\)\s*=|routerLink|href=|\shidden(?:\s|=|>)|\*ngIf|@if/);
  assert.match(button, /<span class="d-lg-none" aria-hidden="true">\?<\/span>/);
  assert.match(button, /<span class="d-none d-lg-inline">วิธีใช้<\/span>/);
  assert.equal(fixture('/trips', false).app.openOnboarding, undefined);
});
