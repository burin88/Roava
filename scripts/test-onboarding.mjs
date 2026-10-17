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
      : token === OnboardingTourService ? service
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
    render() { effects.forEach(callback => callback()); rendered.forEach(callback => callback()); },
    destroy() { cleanup.forEach(callback => callback()); },
  };
}

for (const previouslyVisited of [false, true]) {
  for (const path of ['/', '/trips', '/beijing', '/continent/AS', '/requirements']) {
    test(`${previouslyVisited ? 'returning' : 'first-time'} visit to ${path} does not launch onboarding or navigate`, async () => {
      const f = fixture(path, previouslyVisited);
      f.render();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.tours.length, 0);
      assert.equal(f.navigations.length, 0);
    });
  }
}

test('How to use button remains accessible and bound to the manual tour action', () => {
  const template = fs.readFileSync('src/app/app.html', 'utf8');
  const button = template.match(/<button\b[^>]*\(click\)="openOnboarding\(\)"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button, 'The manual onboarding button must remain in the template');
  assert.match(button, /aria-label="เปิดคำแนะนำการใช้งาน"/);
  assert.match(button, /วิธีใช้/);
});

for (const previouslyVisited of [false, true]) {
  test(`manual onboarding can launch, close, and reopen for a ${previouslyVisited ? 'returning' : 'first-time'} visitor`, async () => {
    const f = fixture('/continent/AS', previouslyVisited);
    f.render();
    for (let attempt = 0; attempt < 2; attempt++) {
      f.app.openOnboarding();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(f.tours.length, attempt + 1);
      assert.equal(f.tours[attempt].drives, 1);
      assert.equal(f.navigations[attempt][0], '/trips');
      f.tours[attempt].destroy();
    }
    f.destroy();
  });
}
