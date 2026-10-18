import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';

const sheet = postcss.parse(await readFile(
  'src/app/features/trips/trip-editor/trip-editor.css', 'utf8'));

// Resolve the component's layout contracts across the mobile breakpoint.
function style(selector, width) {
  const result = {};
  sheet.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return;
    if (rule.parent.type === 'atrule') {
      const max = /max-width:\s*(\d+)px/.exec(rule.parent.params);
      if (!max || width > Number(max[1])) return;
    }
    rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}

for (const width of [320, 375, 390, 620, 621, 820, 1024]) {
  test(`journey fields preserve both side gutters at ${width}px`, () => {
    const mobile = width <= 620;
    const form = style('.journey-modal form', width);
    assert.equal(form.padding, mobile ? '12px 20px 24px' : '12px 32px 32px');
    assert.equal(form['grid-template-columns'], mobile
      ? 'minmax(0,1fr)' : 'repeat(2,minmax(0,1fr))',
    'Long province options must not force the grid past the right gutter');
    assert.equal(style('.journey-modal', width)['min-width'], '0');
    for (const selector of ['.journey-modal label', '.rating-field']) {
      assert.equal(style(selector, width)['min-width'], '0');
    }
    for (const control of ['input', 'select', 'textarea']) {
      const field = style(`.journey-modal ${control}`, width);
      assert.equal(field.width, '100%');
      assert.equal(field['min-width'], '0', 'Native controls must shrink with their grid cell');
      assert.equal(field['max-width'], '100%');
      assert.equal(field['box-sizing'], 'border-box', 'Control padding must fit inside its width');
    }
    assert.equal(style('.country-trigger', width).width, '100%');
  });
}
