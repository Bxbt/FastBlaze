// Turns recorded steps into a snippet template (pure; used by the background and tests).
//
// Step shapes (produced by src/content/recorder.js):
//   { type: 'click', selector?, text? }          text = visible-text match when no good selector
//   { type: 'type', value, clear?, secret?, field? }  value typed into the focused field
//   { type: 'select', selector, text }            native <select>
//   { type: 'key', key }                          enter | escape
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  const tplArg = (s) => String(s).replace(/[\\{};]/g, '\\$&');
  const tplText = (s) => String(s).replace(/[\\{}]/g, '\\$&');

  /** Replace typed test data with a generator command (or null to keep the value). */
  function generatorFor(value) {
    const v = String(value).trim();
    if (/^\d{13}$/.test(v) && FB.validateThaiId && FB.validateThaiId(v)) return v[0] === '8' ? '{thaiid: prefix=8}' : '{thaiid}';
    if (/^\d-\d{4}-\d{5}-\d{2}-\d$/.test(v) && FB.validateThaiId && FB.validateThaiId(v)) return '{thaiid: format=dash}';
    if (/^0[689]\d{8}$/.test(v)) return '{thaiphone}';
    if (/^0[689]\d-\d{3}-\d{4}$/.test(v)) return '{thaiphone: format=dash}';
    if (/^[^\s@{}]+@[^\s@{}]+\.[a-z]{2,}$/i.test(v)) return '{email}';
    return null;
  }

  function stepTemplate(step, opts) {
    switch (step.type) {
      case 'click':
        if (step.text != null && !step.selector) return `{click: text=${tplArg(step.text)}}`;
        return `{click: selector=${tplArg(step.selector)}}`;
      case 'select':
        return `{select: selector=${tplArg(step.selector)}; text=${tplArg(step.text)}}`;
      case 'key':
        return `{key: ${step.key}}`;
      case 'type': {
        const clear = step.clear ? '{clear}' : '';
        if (step.secret) return `${clear}{formtext: name=${tplArg(step.field || 'Password')}}`;
        const gen = opts.convert ? generatorFor(step.value) : null;
        return clear + (gen || tplText(step.value));
      }
      default:
        return '';
    }
  }

  /**
   * steps -> template. opts.convert: typed IDs / phones / emails become generators.
   * Consecutive duplicate clicks collapse into one.
   */
  function buildRecordedTemplate(steps, opts) {
    opts = { convert: true, ...(opts || {}) };
    const out = [];
    let prev = null;
    for (const step of steps || []) {
      if (!step) continue;
      if (prev && step.type === 'click' && prev.type === 'click' && step.selector === prev.selector && step.text === prev.text) continue;
      out.push(stepTemplate(step, opts));
      prev = step;
    }
    const text = out.join('');
    return FB.formatTemplate ? FB.formatTemplate(text) : text;
  }

  FB.recording = { buildRecordedTemplate, generatorFor };
})();
