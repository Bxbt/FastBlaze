// Safe expression evaluator (MV3 forbids eval). Supports:
//   numbers, "strings", variables, + - * / % ^, & (string concat),
//   == != < > <= >=, parentheses, functions (floor, ceil, round, ...).
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  const FUNCS = {
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    trunc: Math.trunc,
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    sqrt: Math.sqrt,
    pow: Math.pow,
    random: () => Math.random(),
    mod: (a, b) => ((a % b) + b) % b,
    len: (s) => String(s).length,
    upper: (s) => String(s).toUpperCase(),
    lower: (s) => String(s).toLowerCase(),
  };

  const COMPARE_OPS = ['==', '!=', '<=', '>=', '<', '>'];

  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        const v = Number(src.slice(i, j));
        if (Number.isNaN(v)) throw new Error(`Bad number "${src.slice(i, j)}"`);
        out.push({ t: 'num', v });
        i = j;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < src.length && /\w/.test(src[j])) j++;
        out.push({ t: 'id', v: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '"' || c === "'") {
        const j = src.indexOf(c, i + 1);
        if (j === -1) throw new Error('Unterminated string');
        out.push({ t: 'str', v: src.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
      const two = src.slice(i, i + 2);
      if (COMPARE_OPS.includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/%^(),&<>'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
      throw new Error(`Unexpected character "${c}"`);
    }
    return out;
  }

  function toNumber(x) {
    if (typeof x === 'number') return x;
    if (typeof x === 'boolean') return x ? 1 : 0;
    const n = Number(String(x).trim());
    if (String(x).trim() === '' || Number.isNaN(n)) throw new Error(`Not a number: "${x}"`);
    return n;
  }

  function formatValue(v) {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return String(v);
      if (Number.isInteger(v)) return String(v);
      return String(Number(v.toFixed(10)));
    }
    if (typeof v === 'boolean') return v ? 'yes' : 'no';
    return v == null ? '' : String(v);
  }

  function evaluate(src, vars) {
    vars = vars || {};
    const tokens = tokenize(String(src));
    let pos = 0;

    const peek = () => tokens[pos];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    const expect = (v) => {
      if (!isOp(v)) throw new Error(`Expected "${v}"`);
      pos++;
    };

    function compare() {
      let l = concat();
      while (peek() && peek().t === 'op' && COMPARE_OPS.includes(peek().v)) {
        const op = tokens[pos++].v;
        const r = concat();
        const bothNum = !Number.isNaN(Number(l)) && !Number.isNaN(Number(r));
        const a = bothNum ? Number(l) : formatValue(l);
        const b = bothNum ? Number(r) : formatValue(r);
        switch (op) {
          case '==': l = a === b; break;
          case '!=': l = a !== b; break;
          case '<': l = a < b; break;
          case '>': l = a > b; break;
          case '<=': l = a <= b; break;
          case '>=': l = a >= b; break;
        }
      }
      return l;
    }

    function concat() {
      let l = additive();
      while (isOp('&')) {
        pos++;
        l = formatValue(l) + formatValue(additive());
      }
      return l;
    }

    function additive() {
      let l = term();
      while (isOp('+') || isOp('-')) {
        const op = tokens[pos++].v;
        const r = toNumber(term());
        l = op === '+' ? toNumber(l) + r : toNumber(l) - r;
      }
      return l;
    }

    function term() {
      let l = power();
      while (isOp('*') || isOp('/') || isOp('%')) {
        const op = tokens[pos++].v;
        const r = toNumber(power());
        if (op === '*') l = toNumber(l) * r;
        else if (op === '/') l = toNumber(l) / r;
        else l = toNumber(l) % r;
      }
      return l;
    }

    function power() {
      const base = unary();
      if (isOp('^')) {
        pos++;
        return Math.pow(toNumber(base), toNumber(power()));
      }
      return base;
    }

    function unary() {
      if (isOp('-')) { pos++; return -toNumber(unary()); }
      if (isOp('+')) { pos++; return toNumber(unary()); }
      return primary();
    }

    function primary() {
      const tk = tokens[pos++];
      if (!tk) throw new Error('Unexpected end of expression');
      if (tk.t === 'num' || tk.t === 'str') return tk.v;
      if (tk.t === 'op' && tk.v === '(') {
        const v = compare();
        expect(')');
        return v;
      }
      if (tk.t === 'id') {
        if (isOp('(')) {
          pos++;
          const args = [];
          if (!isOp(')')) {
            args.push(compare());
            while (isOp(',')) { pos++; args.push(compare()); }
          }
          expect(')');
          const fn = FUNCS[tk.v.toLowerCase()];
          if (!fn) throw new Error(`Unknown function "${tk.v}"`);
          return fn(...args.map((a) => (typeof a === 'string' && a.trim() !== '' && !Number.isNaN(Number(a)) ? Number(a) : a)));
        }
        if (tk.v === 'true' || tk.v === 'yes') return true;
        if (tk.v === 'false' || tk.v === 'no') return false;
        if (!Object.prototype.hasOwnProperty.call(vars, tk.v)) throw new Error(`Unknown variable "${tk.v}"`);
        return vars[tk.v];
      }
      throw new Error(`Unexpected "${tk.v}"`);
    }

    const result = compare();
    if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos].v}"`);
    return result;
  }

  FB.evaluate = evaluate;
  FB.formatValue = formatValue;
})();
