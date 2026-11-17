const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/engine/expr.js');
require('../src/engine/parser.js');
require('../src/engine/thaiid.js');
require('../src/engine/generators.js');
require('../src/engine/runner.js');
const FB = globalThis.FastBlaze;

const run = (tpl, opts) => {
  const r = FB.compile(tpl, opts);
  assert.deepEqual(r.errors, []);
  return r.actions.filter((a) => a.type === 'text').map((a) => a.value).join('');
};
const many = (fn, n = 300) => Array.from({ length: n }, fn);

test('thaiphone: mobile, landline, dashed, prefix', () => {
  for (const p of many(() => run('{thaiphone}'))) assert.match(p, /^0[689][1-9]\d{7}$/);
  for (const p of many(() => run('{thaiphone: type=landline}'))) assert.match(p, /^0[2-7]\d{7}$/);
  for (const p of many(() => run('{thaiphone: format=dash}'))) assert.match(p, /^0[689]\d-\d{3}-\d{4}$/);
  assert.match(run('{thaiphone: prefix=064}'), /^064\d{7}$/);
  assert.match(FB.gen.phone({ type: 'landline', prefix: '02', format: 'dash' }), /^02-\d{3}-\d{4}$/);
});

test('thainame: parts, gender, title, english', () => {
  const thai = /^[฀-๿]+$/;
  assert.match(run('{thainame: part=first}'), thai);
  assert.match(run('{thainame: part=last}'), thai);
  assert.match(run('{thainame}'), /^[฀-๿]+ [฀-๿]+$/);
  for (const n of many(() => run('{thainame: gender=male; title=yes}'), 50)) assert.match(n, /^นาย[฀-๿]+ /);
  for (const n of many(() => run('{thainame: gender=female; title=yes}'), 50)) assert.match(n, /^นางสาว/);
  assert.match(run('{thainame: lang=en; gender=female; title=yes}'), /^Ms\. [A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.match(run('{thainame: lang=en; part=first}'), /^[A-Z][a-z]+$/);
});

test('email: default example.com, custom base and domain, unique', () => {
  assert.match(run('{email}'), /^test\.[a-z]{6}\d{2}@example\.com$/);
  assert.match(run('{email: base=qa; domain=ufriend.test}'), /^qa\.[a-z]{6}\d{2}@ufriend\.test$/);
  const set = new Set(many(() => run('{email}'), 200));
  assert.ok(set.size > 195, 'emails should almost never repeat');
});

test('date: formats with Buddhist / AD year and Thai months', () => {
  const now = new Date(2026, 10, 17); // 17 Nov 2026
  assert.equal(run('{date}', { now }), '17/11/2569');
  assert.equal(run('{date: format=DDMMBBBB}', { now }), '17112569');
  assert.equal(run('{date: format=YYYY-MM-DD}', { now }), '2026-11-17');
  assert.equal(run('{date: format=D MMMM BBBB}', { now }), '17 พฤศจิกายน 2569');
  assert.equal(run('{date: format=D MMM BB}', { now }), '17 พ.ย. 69');
  assert.equal(run('{date: shift=-1d; format=DD/MM/YYYY}', { now }), '16/11/2026');
  assert.equal(run('{date: shift=+1m -2d; format=DD/MM/YYYY}', { now }), '15/12/2026');
  assert.equal(run('{date: shift=-25y; format=DDMMBBBB}', { now }), '17112544');
  assert.match(FB.compile('{date: shift=soon}', { now }).errors[0], /Bad shift/);
});

test('date: random birthday within an age range', () => {
  const now = new Date(2026, 10, 17);
  const ageOn = (d) => {
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
  };
  for (let i = 0; i < 500; i++) {
    const s = run('{date: age=18-60; format=YYYY-MM-DD}', { now });
    const [y, m, d] = s.split('-').map(Number);
    const age = ageOn(new Date(y, m - 1, d));
    assert.ok(age >= 18 && age <= 60, `${s} -> age ${age}`);
  }
  const exact = run('{date: age=25; format=YYYY-MM-DD}', { now });
  const [y, m, d] = exact.split('-').map(Number);
  assert.equal(ageOn(new Date(y, m - 1, d)), 25);
  assert.match(FB.compile('{date: age=60-18}', { now }).errors[0], /reversed/);
});

test('zipcode, bank account, random text', () => {
  for (const z of many(() => run('{zipcode}'))) assert.match(z, /^(1\d|2[0-7]|3\d|4\d|5[0-8]|6[0-7]|7[0-7]|8[0-6]|9[0-6])\d{3}$/);
  assert.match(run('{bankaccount}'), /^[1-9]\d{9}$/);
  assert.match(run('{bankaccount: format=dash}'), /^\d{3}-\d-\d{5}-\d$/);
  assert.match(run('{randomtext}'), /^[a-zA-Z0-9]{8}$/);
  assert.match(run('{randomtext: length=12; type=digits}'), /^\d{12}$/);
  assert.match(run('{randomtext: length=5; type=thai}'), /^[฀-๿]{5}$/);
});

test('generators combine with variables (same person reused)', () => {
  const out = run('{fn={thainame: part=first; gender=male}}{ln={thainame: part=last}}{=fn} {=ln} / {=fn}');
  const [a, b] = out.split(' / ');
  assert.equal(a.split(' ')[0], b);
});

test('highlighter treats generators as data', () => {
  const kinds = FB.tokenizeTemplate('{thaiphone}{thainame}{email}{date}{zipcode}{bankaccount}{randomtext}').map((t) => t.kind);
  assert.deepEqual(kinds, Array(7).fill('data'));
});

test('allow lists: phone and bank only use team-owned values', () => {
  const testData = { phones: ['0811111111', '0822222222', '021234567'], banks: ['1112223334'] };
  for (const p of many(() => run('{thaiphone}', { testData }), 100)) assert.ok(['0811111111', '0822222222'].includes(p), p);
  assert.equal(run('{thaiphone: type=landline}', { testData }), '021234567');
  assert.equal(run('{thaiphone: prefix=082}', { testData }), '0822222222');
  assert.match(run('{thaiphone: format=dash}', { testData }), /^08[12]-\d{3}-\d{4}$/);
  assert.equal(run('{bankaccount}', { testData }), '1112223334');
  assert.equal(run('{bankaccount: format=dash}', { testData }), '111-2-22333-4');
  // explicit opt-out
  assert.match(run('{thaiphone: source=random}', { testData }), /^0[689]\d{8}$/);
});
