const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/expr.js');
require('../src/engine/parser.js');
require('../src/engine/thaiid.js');
require('../src/engine/generators.js');
require('../src/engine/runner.js');
require('../src/engine/recording.js');
const FB = globalThis.FastBlaze;
const build = (steps, opts) => FB.compactTemplate(FB.recording.buildRecordedTemplate(steps, opts));

test('clicks, typing, select and keys become commands', () => {
  const tpl = build([
    { type: 'click', selector: '[data-testid="input-first-name"]' },
    { type: 'type', value: 'สมชาย' },
    { type: 'click', selector: '[data-testid="select-sub-district"]' },
    { type: 'click', text: 'สีลม' },
    { type: 'select', selector: '#province', text: 'เชียงใหม่' },
    { type: 'key', key: 'enter' },
  ]);
  assert.equal(tpl, '{click: selector=[data-testid="input-first-name"]}สมชาย{click: selector=[data-testid="select-sub-district"]}'
    + '{click: text=สีลม}{select: selector=#province; text=เชียงใหม่}{key: enter}');
  const r = FB.compile(tpl);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.actions.map((a) => a.type), ['click', 'text', 'click', 'click', 'select', 'key']);
});

test('typed text is escaped, existing values cleared, passwords never stored', () => {
  const tpl = build([
    { type: 'click', selector: '#a' },
    { type: 'type', value: 'a {b} \\ c', clear: true },
    { type: 'click', selector: '#pw' },
    { type: 'type', value: 'hunter2', secret: true, field: 'Password' },
  ]);
  assert.equal(tpl, '{click: selector=#a}{clear}a \\{b\\} \\\\ c{click: selector=#pw}{formtext: name=Password}');
  assert.ok(!tpl.includes('hunter2'));
  const text = FB.compile(tpl, { formValues: { Password: 'x' } }).actions.filter((a) => a.type === 'text').map((a) => a.value);
  assert.deepEqual(text, ['a {b} \\ c', 'x']);
});

test('test data turns into generators (can be turned off)', () => {
  const id = FB.generateThaiId({ prefix: '8' });
  const steps = [
    { type: 'type', value: id }, { type: 'type', value: '0812345678' }, { type: 'type', value: '081-234-5678' },
    { type: 'type', value: 'qa.user@ufriend.test' }, { type: 'type', value: '1234567890123' }, // invalid checksum stays
  ];
  const tpl = build(steps);
  const bad = '1234567890123';
  assert.equal(tpl, `{thaiid: prefix=8}{thaiphone}{thaiphone: format=dash}{email}${FB.validateThaiId(bad) ? '{thaiid}' : bad}`);
  assert.equal(build([{ type: 'type', value: '0812345678' }], { convert: false }), '0812345678');
});

test('duplicate consecutive clicks collapse; output is formatted one step per line', () => {
  const raw = FB.recording.buildRecordedTemplate([
    { type: 'click', selector: '#a' }, { type: 'click', selector: '#a' }, { type: 'click', selector: '#b' },
  ]);
  assert.equal(raw, '{click: selector=#a}\\\n{click: selector=#b}');
});

test('selectors with ; or braces stay intact', () => {
  const sel = '[data-x="a;b{c}"]';
  const tpl = build([{ type: 'click', selector: sel }]);
  assert.equal(FB.compile(tpl).actions[0].selector, sel);
});
