import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import { parseTemplate } from '@angular/compiler';

const sheet = postcss.parse(readFileSync('src/app/app.css', 'utf8'));
const bootstrap = postcss.parse(readFileSync('node_modules/bootstrap/dist/css/bootstrap.css', 'utf8'));

// Check responsive layout contracts; this does not replace browser rendering.
function style(selector, width, source = sheet) {
  const result = {};
  source.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    for (let parent = rule.parent; parent.type !== 'root'; parent = parent.parent) {
      if (parent.name !== 'media') continue;
      const bounds = [...parent.params.matchAll(/(min|max)-width:\s*([\d.]+)px/g)];
      if (!bounds.length || bounds.some(([, bound, value]) =>
        bound === 'max' ? width > Number(value) : width < Number(value))) return;
    }
    rule.nodes.filter(node => node.type === 'decl').forEach(node => { result[node.prop] = node.value; });
  });
  return result;
}

test('help layout hooks belong to the existing unconditional toolbar button', () => {
  const parsed = parseTemplate(readFileSync('src/app/app.html', 'utf8'), 'app.html');
  assert.equal(parsed.errors, null);
  const header = parsed.nodes.find(node => node.name === 'header');
  const hasClass = (node, value) => node.attributes?.some(attr =>
    attr.name === 'class' && attr.value.split(/\s+/).includes(value));
  const actions = header.children.find(node => hasClass(node, 'toolbar-actions'));
  const help = actions?.children.find(node => hasClass(node, 'help-button'));
  assert.equal(help?.name, 'button');
  assert.ok(help.attributes.some(attr => attr.name === 'disabled'));
  assert.ok(help.attributes.some(attr => attr.name === 'aria-label' && attr.value));
});

for (const width of [320, 375, 600, 768, 991, 992, 1024, 1199, 1200, 1440]) {
  test(`help stays uncompressed and toolbar can wrap at ${width}px`, () => {
    const help = style('.help-button', width);
    assert.equal(help.flex, '0 0 auto');
    assert.equal(help['min-width'], '44px');
    assert.equal(help['min-height'], '44px');
    assert.equal(help.display, 'inline-flex');
    assert.equal(help['white-space'], 'nowrap');
    assert.equal(help.width, width <= 991 ? '44px' : undefined);
    assert.equal(style('.app-header', width)['flex-wrap'], 'wrap');
    assert.equal(style('.toolbar-actions', width)['flex-wrap'], 'wrap');
    assert.equal(style('.toolbar-actions', width)['max-width'], '100%');
    assert.equal(style('.toolbar-actions > *', width)['flex-shrink'], '0');
    assert.equal(style('.app-header > nav', width)['flex-wrap'], 'wrap');
    if (width <= 1199) {
      const nav = style('.app-header>nav', width);
      assert.equal(nav.order, '3');
      assert.equal(nav.width, '100%');
      assert.equal(nav['margin-left'], '0');
    }
    // Preserve the existing Bootstrap label switch at the lg breakpoint.
    assert.equal(style('.d-lg-none', width, bootstrap).display, width >= 992 ? 'none' : undefined);
    assert.equal(style('.d-lg-inline', width, bootstrap).display, width >= 992 ? 'inline' : undefined);
  });
}
