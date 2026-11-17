import json, sys
data = json.load(open(sys.argv[1], encoding='utf-8'))
prov = {}  # th -> {en, zips:set}
for s in data:
    if s.get('deleted_at'):
        continue
    z = str(s.get('zip_code') or '').strip()
    if len(z) != 5 or not z.isdigit():
        continue
    p = s['district']['province']
    entry = prov.setdefault(p['name']['th'], {'en': p['name']['en'], 'zips': set()})
    entry['zips'].add(z)
rows = []
for th in sorted(prov, key=lambda k: min(prov[k]['zips'])):
    e = prov[th]
    rows.append(f"    [{json.dumps(th, ensure_ascii=False)}, {json.dumps(e['en'])}, '{' '.join(sorted(e['zips']))}'],")
total = len({z for e in prov.values() for z in e['zips']})
out = f"""// Real Thai postal codes by province ({total} codes, {len(prov)} provinces).
// Generated from kongvut/thai-province-data (MIT License, (c) Kongvut Sangkla),
// api/latest/sub_district_with_district_and_province.json.
// Regenerate: python3 scripts/build-zipcodes.py <that json> > src/engine/thai-zipcodes.js
(function () {{
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {{}});
  // [province (th), province (en), space-separated postal codes]
  FB.THAI_ZIPCODES = [
{chr(10).join(rows)}
  ];
}})();
"""
sys.stdout.write(out)
