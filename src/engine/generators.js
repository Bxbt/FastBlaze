// Thai test-data generators (pure functions, no DOM). TEST DATA ONLY.
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (list) => list[randInt(0, list.length - 1)];
  const digits = (n) => Array.from({ length: n }, () => randInt(0, 9)).join('');

  // ---- phone ----------------------------------------------------------------
  /** Mobile: 10 digits starting 06/08/09. Landline: 9 digits starting 02-07. */
  function phone(opts) {
    opts = opts || {};
    const type = opts.type === 'landline' ? 'landline' : 'mobile';
    let n;
    const allow = (opts.allow || []).map((x) => String(x).replace(/\D/g, '')).filter(Boolean);
    if (allow.length && opts.source !== 'random') {
      // Safe mode: only numbers the team owns. Prefer the requested type when possible.
      const fit = allow.filter((x) => (type === 'landline' ? x.length === 9 : x.length === 10))
        .filter((x) => !opts.prefix || x.startsWith(String(opts.prefix).replace(/\D/g, '')));
      n = pick(fit.length ? fit : allow);
    } else if (opts.prefix) {
      const p = String(opts.prefix).replace(/\D/g, '');
      n = p + digits(Math.max(0, (type === 'landline' ? 9 : 10) - p.length));
    } else if (type === 'landline') {
      n = `0${randInt(2, 7)}${digits(7)}`;
    } else {
      n = `0${pick([6, 8, 9])}${randInt(1, 9)}${digits(7)}`;
    }
    if (opts.format !== 'dash') return n;
    if (n.length === 10) return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
    if (n.startsWith('02')) return `${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
    return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`;
  }

  // ---- names ----------------------------------------------------------------
  // [Thai, romanized] pairs so th/en stay consistent.
  const MALE = [
    ['สมชาย', 'Somchai'], ['สมศักดิ์', 'Somsak'], ['ประเสริฐ', 'Prasert'], ['วิชัย', 'Wichai'], ['สุรชัย', 'Surachai'],
    ['ธนากร', 'Thanakorn'], ['กิตติพงษ์', 'Kittipong'], ['ณัฐพล', 'Nattapon'], ['อนุชา', 'Anucha'], ['ปิยะ', 'Piya'],
    ['ธีรวัฒน์', 'Theerawat'], ['ชัยวัฒน์', 'Chaiwat'], ['ศุภชัย', 'Suppachai'], ['พงศกร', 'Pongsakorn'], ['วีรยุทธ', 'Weerayut'],
  ];
  const FEMALE = [
    ['สมหญิง', 'Somying'], ['สุภาพร', 'Supaporn'], ['วิไลวรรณ', 'Wilaiwan'], ['กาญจนา', 'Kanchana'], ['นภัสสร', 'Napatsorn'],
    ['ปิยะนุช', 'Piyanuch'], ['ศิริพร', 'Siriporn'], ['อรอุมา', 'Onuma'], ['จิราพร', 'Jiraporn'], ['พรทิพย์', 'Porntip'],
    ['ณัฐธิดา', 'Nattida'], ['กมลชนก', 'Kamonchanok'], ['สุนิสา', 'Sunisa'], ['ชุติมา', 'Chutima'], ['รัตนา', 'Rattana'],
  ];
  const LAST = [
    ['ใจดี', 'Jaidee'], ['สุขสวัสดิ์', 'Suksawat'], ['ศรีสุข', 'Srisuk'], ['วงศ์ไทย', 'Wongthai'], ['รักษ์ไทย', 'Rakthai'],
    ['ทองดี', 'Thongdee'], ['แก้วมณี', 'Kaewmanee'], ['บุญมา', 'Boonma'], ['มีสุข', 'Meesuk'], ['พันธุ์ดี', 'Phandee'],
    ['เจริญผล', 'Charoenphon'], ['สมบูรณ์', 'Somboon'], ['ประเสริฐศรี', 'Prasertsri'], ['ศักดิ์สิทธิ์', 'Saksit'], ['รุ่งเรือง', 'Rungruang'],
  ];
  const TITLES = { male: ['นาย', 'Mr.'], female: ['นางสาว', 'Ms.'] };

  /** opts: part = first | last | full, gender = male | female | any, lang = th | en, title = yes */
  function name(opts) {
    opts = opts || {};
    const gender = opts.gender === 'male' || opts.gender === 'female' ? opts.gender : pick(['male', 'female']);
    const li = opts.lang === 'en' ? 1 : 0;
    const first = pick(gender === 'male' ? MALE : FEMALE)[li];
    const last = pick(LAST)[li];
    const part = opts.part || 'full';
    let out = part === 'first' ? first : part === 'last' ? last : `${first} ${last}`;
    if (opts.title && part !== 'last') out = li ? `${TITLES[gender][1]} ${out}` : `${TITLES[gender][0]}${out}`;
    return out;
  }

  // ---- email ----------------------------------------------------------------
  const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

  function randomText(opts) {
    opts = opts || {};
    const length = Math.max(1, Math.min(200, Number(opts.length) || 8));
    const sets = {
      letters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
      lower: 'abcdefghijklmnopqrstuvwxyz',
      upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      digits: '0123456789',
      alnum: `${ALNUM}ABCDEFGHIJKLMNOPQRSTUVWXYZ`,
      thai: 'กขคงจฉชซญดตถทธนบปผพฟภมยรลวศษสหอฮ',
    };
    const chars = sets[opts.type] || sets.alnum;
    return Array.from({ length }, () => chars[randInt(0, chars.length - 1)]).join('');
  }

  /** Unique-looking test address. Default domain example.com (reserved, never delivers). */
  function email(opts) {
    opts = opts || {};
    const base = String(opts.base || 'test').toLowerCase().replace(/[^a-z0-9._+-]/g, '') || 'test';
    const domain = String(opts.domain || 'example.com').replace(/^@/, '');
    return `${base}.${randomText({ length: 6, type: 'lower' })}${randInt(10, 99)}@${domain}`;
  }

  // ---- zip code / bank account ---------------------------------------------------
  const ZIP_PREFIXES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 30, 31, 32, 33, 34, 35, 36,
    37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 60, 61, 62, 63, 64, 65, 66, 67,
    70, 71, 72, 73, 74, 75, 76, 77, 80, 81, 82, 83, 84, 85, 86, 90, 91, 92, 93, 94, 95, 96];

  function zipcode() {
    return `${pick(ZIP_PREFIXES)}${pick(['000', '110', '120', '130', '140', '150', '160', '170', '180', '190', '210', '220'])}`;
  }

  function bankAccount(opts) {
    opts = opts || {};
    const allow = (opts.allow || []).map((x) => String(x).replace(/\D/g, '')).filter(Boolean);
    const n = allow.length && opts.source !== 'random' ? pick(allow) : `${randInt(1, 9)}${digits(9)}`;
    return opts.format === 'dash' && n.length === 10 ? `${n.slice(0, 3)}-${n[3]}-${n.slice(4, 9)}-${n[9]}` : n;
  }

  // ---- dates ----------------------------------------------------------------
  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const pad = (n, w) => String(n).padStart(w, '0');

  /**
   * Tokens: BBBB (Buddhist year) BB, YYYY (AD) YY, MMMM (Thai month) MMM (Thai short) MM M, DD D.
   * Anything else is copied as is.
   */
  function formatDate(d, fmt) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();
    return String(fmt || 'DD/MM/BBBB').replace(/BBBB|BB|YYYY|YY|MMMM|MMM|MM|M|DD|D/g, (t) => ({
      BBBB: String(y + 543), BB: pad((y + 543) % 100, 2), YYYY: String(y), YY: pad(y % 100, 2),
      MMMM: TH_MONTHS[m], MMM: TH_MONTHS_SHORT[m], MM: pad(m + 1, 2), M: String(m + 1), DD: pad(day, 2), D: String(day),
    })[t]);
  }

  /** "-25y", "+3d", "1m -2w" ... applied in order. */
  function shiftDate(d, shift) {
    const out = new Date(d.getTime());
    const re = /([+-]?\d+)\s*([dwmy])/gi;
    let m;
    let any = false;
    while ((m = re.exec(String(shift || '')))) {
      any = true;
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (unit === 'd') out.setDate(out.getDate() + n);
      else if (unit === 'w') out.setDate(out.getDate() + n * 7);
      else if (unit === 'm') out.setMonth(out.getMonth() + n);
      else out.setFullYear(out.getFullYear() + n);
    }
    if (shift && !any) throw new Error(`Bad shift "${shift}" (use e.g. -25y, +3d, 1m)`);
    return out;
  }

  /** Random birthday for an age between min and max (inclusive) on `now`. */
  function birthday(now, age) {
    const m = String(age).match(/^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/);
    if (!m) throw new Error(`Bad age "${age}" (use e.g. 25 or 18-60)`);
    const min = Number(m[1]);
    const max = Number(m[2] ?? m[1]);
    if (max < min) throw new Error('Age range is reversed');
    // born after (now - (max+1) years) and on/before (now - min years)
    const latest = shiftDate(now, `-${min}y`);
    const earliest = shiftDate(now, `-${max + 1}y`);
    earliest.setDate(earliest.getDate() + 1);
    // Count whole calendar days (time zone independent).
    const dayIndex = (x) => Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 864e5);
    const u = new Date(randInt(dayIndex(earliest), dayIndex(latest)) * 864e5);
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
  }

  /** opts: format, shift, age (random birthday), now (Date, for tests) */
  function date(opts) {
    opts = opts || {};
    const now = opts.now ? new Date(opts.now) : new Date();
    let d = opts.age != null && opts.age !== '' ? birthday(now, opts.age) : now;
    if (opts.shift) d = shiftDate(d, opts.shift);
    return formatDate(d, opts.format);
  }

  FB.gen = { phone, name, email, zipcode, bankAccount, randomText, date, formatDate, shiftDate, birthday };
})();
