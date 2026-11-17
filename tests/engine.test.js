const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/expr.js');
require('../src/engine/parser.js');
require('../src/engine/thaiid.js');
require('../src/engine/runner.js');
const FB = globalThis.FastBlaze;

const textOnly = (r) => r.actions.filter((a) => a.type === 'text').map((a) => a.value).join('');

test('thai id: known checksum', () => {
  assert.equal(FB.validateThaiId('1234567890121'), true);
  assert.equal(FB.validateThaiId('1234567890122'), false);
  assert.equal(FB.validateThaiId('1-2345-67890-12-1'), true);
  assert.equal(FB.validateThaiId('123'), false);
});

test('thai id: generated ids are always valid', () => {
  for (let i = 0; i < 2000; i++) {
    const id = FB.generateThaiId();
    assert.match(id, /^[1-8]\d{12}$/);
    assert.ok(FB.validateThaiId(id), id);
  }
  assert.match(FB.generateThaiId({ prefix: '8' }), /^8\d{12}$/);
  assert.match(FB.generateThaiId({ format: 'dash' }), /^\d-\d{4}-\d{5}-\d{2}-\d$/);
});

test('expr: arithmetic, functions, concat, compare', () => {
  assert.equal(FB.evaluate('1 + 2 * 3'), 7);
  assert.equal(FB.evaluate('(1 + 2) * 3'), 9);
  assert.equal(FB.evaluate('2 ^ 3 ^ 2'), 512);
  assert.equal(FB.evaluate('-3 + 5'), 2);
  assert.equal(FB.evaluate('floor(7/2)'), 3);
  assert.equal(FB.evaluate('x - 11*floor(x/11)', { x: '352' }), 0);
  assert.equal(FB.evaluate('"a" & 1 & "b"'), 'a1b');
  assert.equal(FB.evaluate('x == 5', { x: '5' }), true);
  assert.equal(FB.formatValue(0.1 + 0.2), '0.3');
  assert.throws(() => FB.evaluate('nope + 1'), /Unknown variable/);
  assert.throws(() => FB.evaluate('alert(1)'), /Unknown function/);
});

test('template: variables and expressions', () => {
  const r = FB.compile('{a=5}{b={=a*2}}{=a} + {=b} = {=a+b}');
  assert.deepEqual(r.errors, []);
  assert.equal(textOnly(r), '5 + 10 = 15');
});

test('template: escapes and unknown braces', () => {
  assert.equal(textOnly(FB.compile('a \\{b\\} c')), 'a {b} c');
  assert.equal(textOnly(FB.compile('open { brace')), 'open { brace');
});

test('template: random-number is integer in range', () => {
  for (let i = 0; i < 200; i++) {
    const v = Number(textOnly(FB.compile('{random-number: min=3; max=5; rounded=yes}')));
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 5, String(v));
  }
});

// The exact /id snippet from the Text Blaze export must keep working unchanged.
const TB_ID_SNIPPET = '{d1=8}{d2={random-number: min=0; max=9; rounded=yes}}{d3={random-number: min=0; max=9; rounded=yes}}{d4={random-number: min=0; max=9; rounded=yes}}{d5={random-number: min=0; max=9; rounded=yes}}{d6={random-number: min=0; max=9; rounded=yes}}{d7={random-number: min=0; max=9; rounded=yes}}{d8={random-number: min=0; max=9; rounded=yes}}{d9={random-number: min=0; max=9; rounded=yes}}{d10={random-number: min=0; max=9; rounded=yes}}{d11={random-number: min=0; max=9; rounded=yes}}{d12={random-number: min=0; max=9; rounded=yes}}{sum13=13*d1 + 12*d2 + 11*d3 + 10*d4 + 9*d5 + 8*d6 + 7*d7 + 6*d8 + 5*d9 + 4*d10 + 3*d11 + 2*d12}{mod11={=sum13-11*floor(sum13/11)}}{chk={=11 - mod11}}{chk={=chk-10*floor(chk/10)}}{=d1}{=d2}{=d3}{=d4}{=d5}{=d6}{=d7}{=d8}{=d9}{=d10}{=d11}{=d12}{=chk}';

test('compat: Text Blaze /id snippet yields valid Thai IDs', () => {
  for (let i = 0; i < 300; i++) {
    const r = FB.compile(TB_ID_SNIPPET);
    assert.deepEqual(r.errors, []);
    const id = textOnly(r);
    assert.match(id, /^8\d{12}$/);
    assert.ok(FB.validateThaiId(id), id);
  }
});

test('compat: click + formtext + import flow', () => {
  const snippets = { '/id': TB_ID_SNIPPET, '/tt': 'abc. กขค, 12/3' };
  const lookup = (s) => snippets[s] ?? null;
  const tpl = '{click: selector=[data-testid="input-first-name"]}{formtext: name=firstname_lead; default=ทดสอบ}'
    + '{click: selector=[data-testid="input-id-card-number"]}{import: /id}'
    + '{click: selector=.text-base.focus\\\\:outline-none}{click: selector=.overflow-auto > :nth-child(1)}'
    + '{import: /tt}{wait: 1s}{key: enter}';

  assert.deepEqual(FB.collectFields(tpl, lookup), [
    { name: 'firstname_lead', kind: 'text', default: 'ทดสอบ', options: null, cols: null },
  ]);

  const r = FB.compile(tpl, { lookup, formValues: { firstname_lead: 'สมชาย' } });
  assert.deepEqual(r.errors, []);
  const a = r.actions;
  assert.deepEqual(a[0], { type: 'click', selector: '[data-testid="input-first-name"]' });
  assert.deepEqual(a[1], { type: 'text', value: 'สมชาย' });
  assert.deepEqual(a[2], { type: 'click', selector: '[data-testid="input-id-card-number"]' });
  assert.ok(FB.validateThaiId(a[3].value));
  assert.deepEqual(a[4], { type: 'click', selector: '.text-base.focus\\:outline-none' });
  assert.deepEqual(a[5], { type: 'click', selector: '.overflow-auto > :nth-child(1)' });
  assert.deepEqual(a[6], { type: 'text', value: 'abc. กขค, 12/3' });
  assert.deepEqual(a[7], { type: 'wait', ms: 1000 });
  assert.deepEqual(a[8], { type: 'key', key: 'enter' });
});

test('import loop is caught, not infinite', () => {
  const r = FB.compile('{import: /a}', { lookup: () => '{import: /a}' });
  assert.ok(r.errors.some((e) => /too deep/.test(e)));
});

test('unknown command reports error', () => {
  const r = FB.compile('x{bogus: 1}y');
  assert.equal(textOnly(r), 'xy');
  assert.equal(r.errors.length, 1);
});

test('formmenu options and thaiid command', () => {
  const tpl = '{formmenu: default=Mr; Mrs; Ms; name=title}';
  assert.deepEqual(FB.collectFields(tpl)[0].options, ['Mr', 'Mrs', 'Ms']);
  assert.equal(textOnly(FB.compile(tpl, { formValues: { title: 'Ms' } })), 'Ms');
  assert.ok(FB.validateThaiId(textOnly(FB.compile('{thaiid}'))));
  assert.match(textOnly(FB.compile('{thaiid: prefix=1; format=dash}')), /^1-\d{4}-/);
});
