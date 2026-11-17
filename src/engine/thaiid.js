// Thai national ID (13 digits) generator / validator — for TEST DATA ONLY.
// Check digit: (11 - (sum(d[i] * (13 - i)) mod 11)) mod 10, i = 0..11
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  function checkDigit(first12) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (13 - i);
    return (11 - (sum % 11)) % 10;
  }

  function generateThaiId(opts) {
    opts = opts || {};
    let prefix = String(opts.prefix ?? opts.first ?? '').replace(/\D/g, '').slice(0, 12);
    if (!prefix) prefix = String(randInt(1, 8));
    while (prefix.length < 12) prefix += randInt(0, 9);
    const id = prefix + checkDigit(prefix);
    return opts.format === 'dash' ? formatThaiId(id) : id;
  }

  function formatThaiId(id) {
    const d = String(id).replace(/\D/g, '');
    return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
  }

  function validateThaiId(id) {
    const d = String(id).replace(/\D/g, '');
    if (!/^\d{13}$/.test(d)) return false;
    return checkDigit(d.slice(0, 12)) === Number(d[12]);
  }

  FB.generateThaiId = generateThaiId;
  FB.validateThaiId = validateThaiId;
  FB.formatThaiId = formatThaiId;
})();
