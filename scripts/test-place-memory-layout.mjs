import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';
import { parseTemplate } from '@angular/compiler';

const base = 'src/app/features/cities/city-memory/city-memory';
const template = await readFile(`${base}.html`, 'utf8');
const sheet = postcss.parse(await readFile(`${base}.css`, 'utf8'));

// Resolve the relevant component rules in source order at each viewport width.
// These are layout contracts, not a substitute for browser rendering.
function style(selectors, width) {
  const result = {};
  sheet.walkRules(rule => {
    if (!rule.selectors.some(selector => selectors.includes(selector))) return;
    if (rule.parent.type === 'atrule') {
      const max = /max-width:\s*(\d+)px/.exec(rule.parent.params);
      if (!max || width > Number(max[1])) return;
    }
    rule.nodes.filter(node => node.type === 'decl').forEach(decl => {
      result[decl.prop] = decl.value;
    });
  });
  return result;
}

test('place editor template parses and the time toggle belongs to its own heading', () => {
  const parsed = parseTemplate(template, `${base}.html`);
  assert.equal(parsed.errors, null);
  const elements = [];
  function visit(nodes, ancestors = []) {
    for (const node of nodes ?? []) {
      if (node.name) elements.push({ node, ancestors });
      visit(node.children, [...ancestors, node]);
      for (const branch of node.branches ?? []) visit(branch.children, ancestors);
    }
  }
  visit(parsed.nodes);
  const hasClass = (node, name) => node.attributes?.some(attr =>
    attr.name === 'class' && attr.value.split(/\s+/).includes(name));
  const toggle = elements.find(({ node }) => hasClass(node, 'time-format-toggle'));
  assert.ok(toggle);
  assert.ok(hasClass(toggle.ancestors.at(-1), 'place-time-heading'));
  assert.equal(toggle.ancestors.some(node => node.name === 'label'), false,
    'Multiple time controls and format buttons must not share a wrapping label');
  for (const name of ['placeHour24', 'placeMinute24', 'placeHour12', 'placeMinute12', 'placeMeridiem']) {
    const control = elements.find(({ node }) => node.attributes?.some(attr => attr.name === 'name' && attr.value === name));
    assert.ok(control?.node.attributes.some(attr => attr.name === 'aria-label' && attr.value));
  }
});

test('24-hour mode has only hour and minute fields while 12-hour mode retains AM/PM', () => {
  const parsed = parseTemplate(template, `${base}.html`);
  assert.equal(parsed.errors, null);
  const branches = [];
  function visit(nodes) {
    for (const node of nodes ?? []) {
      branches.push(...(node.branches ?? []));
      visit(node.children);
      for (const branch of node.branches ?? []) visit(branch.children);
    }
  }
  visit(parsed.nodes);
  const branch = branches.find(node => node.expression?.source === "placeTimeFormat === '24h'");
  assert.ok(branch, '24-hour controls must be conditional on the selected format');
  const row = branch.children.find(node => node.attributes?.some(attr => attr.value === 'time-24-input'));
  assert.deepEqual(row.children.map(node => node.name), ['input', 'span', 'input'],
    '24-hour mode must not render a meridiem badge or selector');
  const help = branch.children.find(node => node.name === 'small');
  assert.doesNotMatch(help.children.map(node => node.value ?? '').join(''), /AM|PM/);
  const alternate = branches.find(node => !node.expression && node.children.some(child =>
    child.attributes?.some(attr => attr.value === 'time-12-input')));
  const selector = alternate?.children[0].children.find(node =>
    node.attributes?.some(attr => attr.name === 'name' && attr.value === 'placeMeridiem'));
  assert.ok(selector, '12-hour mode still needs its AM/PM selector');
  assert.deepEqual(selector.children.map(node => node.attributes.find(attr => attr.name === 'value')?.value), ['AM', 'PM']);
});

for (const width of [320, 375, 390, 600, 768, 1024]) {
  test(`date and time have sufficient layout space at ${width}px`, () => {
    const row = style(['.form-row', '.place-modal .form-row'], width);
    assert.equal(row['grid-template-columns'], width <= 600
      ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))');
    assert.equal(style(['.place-time-heading'], width)['flex-wrap'], 'wrap');
    assert.ok(!['absolute', 'fixed'].includes(style(['.time-format-toggle'], width).position),
      'Format toggle must take up space so it cannot cover the Time label');
    assert.equal(style(['.time-12-input'], width)['grid-template-columns'],
      'minmax(0, 1fr) auto minmax(0, 1fr) minmax(54px, 1fr)');
    assert.equal(style(['.time-24-input'], width)['grid-template-columns'],
      'minmax(0, 1fr) auto minmax(0, 1fr)');
    for (const control of ['input', 'select', 'textarea']) {
      const field = style([`.mini-modal ${control}`, `.place-modal ${control}`], width);
      assert.equal(field.width, '100%');
      assert.equal(field['min-width'], '0');
      if (width <= 600) {
        assert.equal(field['font-size'], '16px', 'Avoid mobile focus zoom');
        assert.equal(field['min-height'], '44px');
      }
    }
  });
}

test('dialog keeps all content reachable in a short viewport and wraps mobile actions', () => {
  for (const width of [320, 600, 1024]) {
    const modal = style(['.mini-modal', '.place-modal'], width);
    const gutter = width <= 600 ? 24 : 40;
    assert.equal(modal['max-height'], `calc(100dvh - ${gutter}px)`);
    assert.equal(modal.overflow, 'auto');
    assert.equal(modal['min-height'], '0');
    const fallback = [];
    sheet.walkDecls('max-height', decl => {
      if (decl.parent.selectors?.includes('.place-modal')) fallback.push(decl.value);
    });
    assert.ok(fallback.includes(`calc(100vh - ${gutter}px)`));
  }
  for (const selector of ['.place-modal footer', '.place-modal .place-rating > div', '.place-modal .place-photo-head']) {
    assert.equal(style([selector], 320)['flex-wrap'], 'wrap');
  }
  assert.match(template, /class="modal-backdrop place-dialog-backdrop"/);
  assert.equal(style(['.place-modal header button'], 320)['flex-shrink'], '0');
  assert.equal(style(['.place-modal h2'], 320)['overflow-wrap'], 'anywhere');
});
