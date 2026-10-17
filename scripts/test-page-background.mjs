import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';

// Read styles in the same order as the application build. Resolve the cascade
// for the document canvas, where :root outranks a plain html selector.
const config = JSON.parse(await readFile('angular.json', 'utf8'));
const sheets = await Promise.all(
  config.projects['asia-travel-atlas'].architect.build.options.styles
    .map(async file => postcss.parse(await readFile(file, 'utf8'))),
);
const appSheet = postcss.parse(await readFile('src/app/app.css', 'utf8'));
const appTemplate = await readFile('src/app/app.html', 'utf8');
const bootstrapSheet = postcss.parse(await readFile('node_modules/bootstrap/dist/css/bootstrap.css', 'utf8'));

function appStyle(selector) {
  const declarations = {};
  appSheet.walkRules(rule => {
    if (rule.parent.type === 'root' && rule.selectors.includes(selector)) {
      rule.walkDecls(decl => { declarations[decl.prop] = decl.value; });
    }
  });
  return declarations;
}

test('Requirements paints a solid theme surface across the full main area', () => {
  assert.match(appTemplate, /<main \[class\.requirements-page\]="anonymousRequirements\(\)">/);
  const main = appStyle('main.requirements-page');
  assert.equal(main.background, 'var(--bs-body-bg)');
  for (const theme of ['light', 'dark']) {
    const palette = documentStyle('html', theme, [bootstrapSheet, ...sheets]);
    assert.match(palette['--bs-body-bg'], /^#(?:[\da-f]{3}|[\da-f]{6})$/i,
      'Use a solid surface in either theme instead of the canvas gradient');
  }
  assert.notEqual(
    documentStyle('html', 'light', [bootstrapSheet])['--bs-body-bg'],
    documentStyle('html', 'dark', [bootstrapSheet])['--bs-body-bg'],
  );
});

test('Requirements fills short viewports and grows below a wrapping mobile header', () => {
  const host = appStyle(':host');
  assert.equal(host.display, 'flex');
  assert.equal(host['flex-direction'], 'column');
  assert.equal(host['min-height'], '100dvh');
  assert.ok(appSheet.toString().includes('min-height:100vh'), 'Keep the viewport fallback');
  assert.equal(appStyle('.app-header')['flex-shrink'], '0');
  const main = appStyle('main.requirements-page');
  assert.equal(main.flex, '1 0 auto', 'Fill remaining height without shrinking long content');
  for (const style of [host, main]) {
    assert.equal(style.height, undefined, 'Allow content and header height to grow');
    assert.equal(style['max-height'], undefined);
    assert.equal(style.overflow, undefined, 'Preserve document scrolling');
    assert.equal(style['max-width'], undefined, 'Paint beyond the constrained content column');
  }
});

function documentStyle(element, theme, stylesheets = sheets, requirements = false) {
  const winners = new Map();
  for (const sheet of stylesheets) {
    sheet.walkRules(rule => {
      if (rule.parent.type !== 'root') return;
      for (const selector of rule.selectors) {
        const themeSelector = /^\[data-bs-theme=['"]?(light|dark)['"]?\]$/.exec(selector);
        const requirementsCanvas = requirements && element === 'html' && selector === 'html:has(main.requirements-page)';
        const matches = requirementsCanvas || selector === element || selector === '*' ||
          (element === 'html' && (selector === ':root' || themeSelector?.[1] === theme));
        if (!matches) continue;
        const specificity = requirementsCanvas ? 12 : selector === ':root' || themeSelector ? 10 : selector === '*' ? 0 : 1;
        rule.walkDecls(decl => {
          const priority = specificity + (decl.important ? 1000 : 0);
          const set = (property, value) => {
            if (priority >= (winners.get(property)?.priority ?? -1)) {
              winners.set(property, { priority, value });
            }
          };
          set(decl.prop, decl.value);
          // A background shorthand resets omitted longhands, even when a
          // lower-specificity rule explicitly sets background-attachment.
          if (decl.prop === 'background') {
            set('background-attachment', /\b(fixed|local|scroll)\b/.exec(decl.value)?.[1] ?? 'scroll');
          }
        });
      }
    });
  }
  return Object.fromEntries([...winners].map(([property, entry]) => [property, entry.value]));
}

test('Requirements uses the same solid surface on main and the document in either theme', () => {
  // Include Bootstrap, which supplies --bs-body-bg, and all application sheets
  // in build order. The route selector must beat the existing :root gradient.
  for (const theme of ['light', 'dark']) {
    const styles = [bootstrapSheet, ...sheets];
    const canvas = documentStyle('html', theme, styles, true);
    assert.equal(canvas.background, appStyle('main.requirements-page').background);
    assert.match(canvas['--bs-body-bg'], /^#(?:[\da-f]{3}|[\da-f]{6})$/i);
    assert.equal(documentStyle('body', theme, styles, true).background, 'transparent');
    assert.equal(documentStyle('html', theme, styles, false).background, 'var(--atlas-bg)',
      'Leaving Requirements restores the atlas canvas');
  }
});

test('canvas cascade accounts for background shorthand attachment resets', () => {
  const styles = [postcss.parse(`
    :root { background: var(--atlas-bg); }
    html, body { background: var(--atlas-bg); background-attachment: fixed; }
  `)];
  assert.equal(documentStyle('html', 'light', styles)['background-attachment'], 'scroll');
  assert.equal(documentStyle('body', 'light', styles)['background-attachment'], 'fixed');
});

for (const theme of ['light', 'dark']) {
  test(`${theme} document canvas supplies one uninterrupted page background`, () => {
    const root = documentStyle('html', theme);
    const body = documentStyle('body', theme);
    const resolve = value => value.replace(/var\((--[\w-]+)\)/g, (_, name) => root[name]);
    assert.equal(body.background, 'transparent',
      'Requirements must expose the same canvas behind content and below it');
    assert.match(resolve(root.background), /radial-gradient/);
    assert.equal(root['color-scheme'], theme);
    assert.equal(root['background-attachment'], 'fixed');
    assert.equal(body['background-attachment'], 'scroll',
      'The transparent body needs no separate fixed background');
  });
}

test('switching themes updates both page layers to the final theme palette', () => {
  const light = documentStyle('html', 'light');
  const dark = documentStyle('html', 'dark');
  assert.notEqual(light['--atlas-bg'], dark['--atlas-bg']);
  for (const theme of ['light', 'dark']) {
    const root = documentStyle('html', theme);
    assert.equal(root.background, 'var(--atlas-bg)',
      'The canvas must follow theme changes instead of retaining a hard-coded colour');
    assert.equal(documentStyle('body', theme).background, 'transparent');
    assert.equal(root['--atlas-bg'], theme === 'light'
      ? 'radial-gradient(circle at 50% -20%, #dceef9 0, #f4f9fc 45%, #eaf3f8 100%)'
      : 'radial-gradient(circle at 50% -20%, #12334c 0, #091f2f 43%, #061924 100%)');
  }
});

test('browsers without fixed background support still paint only one gradient', () => {
  for (const theme of ['light', 'dark']) {
    // Mobile browsers may treat background-attachment: fixed as scroll. In
    // that case body and html have different painting areas on short/long pages;
    // avoiding a second image prevents either area from restarting the gradient.
    const layers = ['html', 'body'].map(element => documentStyle(element, theme));
    assert.equal(layers.filter(style => style.background.includes('var(--atlas-bg)')).length, 1);
    assert.equal(layers[1]['background-image'], undefined);
    assert.equal(layers[1]['background-color'], undefined);
  }
});

test('short pages fill the viewport while long Requirements content can grow', () => {
  const body = documentStyle('body', 'light');
  assert.equal(body['min-height'], '100dvh');
  const fallback = [];
  for (const sheet of sheets) sheet.walkRules(rule => {
    if (rule.parent.type === 'root' && rule.selectors.includes('body')) {
      rule.walkDecls('min-height', decl => fallback.push(decl.value));
    }
  });
  assert.ok(fallback.includes('100vh'), 'Provide a fallback for older browsers');
  assert.equal(body.height, undefined, 'Avoid clipping long tables and the editor');
  assert.equal(body.overflow, undefined, 'Keep document scrolling available');
});
