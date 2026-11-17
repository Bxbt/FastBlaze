# FastBlaze Roadmap

สถานะ: v0.6 — Phase 1–5 เสร็จ (flow เสถียร, settings, logo, element picker, theme)
ลำดับด้านล่างเรียงตาม "คุ้มค่า / แรงที่ใช้" — ทำทีละ phase, แต่ละ phase ใช้งานได้จริงเมื่อจบ

---

## Phase 1 — ความเสถียรตอนรัน flow (ทำก่อน, ~0.5–1 วัน)

ปัญหาที่จะเจอจริงบนเว็บ Ufriend ก่อนเรื่อง UI

- [x] **บอกว่าพังที่ขั้นไหน** — toast แสดง `Step 14/26: click .overflow-auto > :nth-child(1)` + สาเหตุ
- [x] **ปุ่มหยุด / กด Esc ยกเลิก flow** ระหว่างรัน + แถบ progress มุมซ้ายล่าง
- [x] **`{clear}`** — ล้างค่าในช่องก่อนพิมพ์ (เดิมต่อท้ายค่าเดิม)
- [x] **`{select: selector=...; value=...}`** — รองรับ `<select>` ธรรมดา (value / text / index)
- [x] **Settings**: เปิด/ปิด highlight, ความเร็วต่อ step, timeout รอ element
- [x] Highlight สีแดงที่ element ที่พังเมื่อ flow ล้ม
- [x] Logo + icon 16/32/48/128

## Phase 2 — Editor อ่านง่าย (~1 วัน)

- [x] Syntax highlight ใน template (action = น้ำเงิน, form = เขียว, data = ฟ้า, import = ส้ม, logic = ม่วง, ไม่รู้จัก = แดง)
- [x] ปุ่ม "Format" / "Compact" — 1 คำสั่งต่อบรรทัดด้วย `\` ต่อบรรทัด (ผลลัพธ์ตอนรันเหมือนเดิม)
- [x] แผง Dynamic commands: ค้นหา + ฟอร์มตั้งค่าแบบ dropdown สำหรับทุกคำสั่ง
- [x] Autocomplete `{import: /` → รายชื่อ shortcut
- [x] ช่อง "Try it out" ในหน้า Options (หน้า Welcome + ใต้ Preview)
- [x] Sidebar: พับ/ขยายโฟลเดอร์, ลากสลับตำแหน่ง/ย้ายโฟลเดอร์, เมนูคลิกขวา, ปิดใช้โฟลเดอร์, เรียงลำดับ
- [x] กด step ใน Preview → กระโดดไปตำแหน่งใน template
- [x] หน้า editor แบบ Label / Shortcut + Try it out popover + Edit/Preview
- [x] CI: GitHub Actions รัน syntax check + `npm test` ทุก PR

## Phase 3 — Element picker (~1 วัน) ⭐ คุ้มที่สุดสำหรับ automation

- [x] ปุ่ม "Pick" ใน popup / `Alt+Shift+P` → hover บนเว็บ = กรอบเหลือง, คลิก = ได้ selector (↑/↓ เลือก parent/child, Esc ยกเลิก)
- [x] ลำดับการสร้าง selector (ตรวจทุกตัวว่าชี้ element เดียวกันจริง):
      `data-testid` → `id` → `name` / `aria-label` / `placeholder` → ข้อความ (`{click: text=...}`) → anchored → class / path
- [x] ป้าย stable / ok / fragile + เตือนเมื่อมีแต่ selector เปราะ
- [x] Copy อัตโนมัติ + ปุ่ม "Insert picked" ใน editor
- [x] `{click: text=...}` คลิกตามข้อความที่เห็น (เหมาะกับตัวเลือกใน dropdown)
- [x] สีหน้า Manage/popup ตาม CI ของ logo + สลับ Appearance (System / Light / Dark)

## Phase 4 — Record mode (~2–3 วัน)

- [x] กดอัด → ทำงานบนเว็บตามปกติ → กดหยุด → ได้ snippet ทั้ง flow (popup หรือหน้า Manage)
- [x] จับ click, การพิมพ์ (รวมเป็น text ก้อนเดียวต่อช่อง, password ไม่เก็บ), เลือก dropdown, key Enter/Escape, ข้ามหน้าได้
- [x] แปลงค่าที่พิมพ์ให้เป็นคำสั่ง (เลขบัตร → `{thaiid}`, เบอร์ → `{thaiphone}`, อีเมล → `{email}`)
- [x] ใช้ selector engine เดียวกับ Phase 3 (รวม Shadow DOM `|>`)

## Phase 5 — Test data generators (~0.5 วัน)

- [x] `{thaiphone}` เบอร์มือถือ/บ้าน, `{thainame}` ชื่อ-นามสกุลไทย (+อังกฤษ, คำนำหน้า), `{email}`, `{zipcode}`, `{bankaccount}`, `{randomtext}`
- [x] `{date: age=20-40; format=DDMMBBBB}` / `shift=-3d` รองรับปี พ.ศ. และชื่อเดือนไทย
- [ ] `{clipboard}`, `{cursor}`

## Phase 6 — Data & การแชร์ (~0.5–1 วัน)

- [ ] Backup อัตโนมัติ / `chrome.storage.sync` (ข้ามเครื่อง, จำกัด ~100KB)
- [ ] Export รายโฟลเดอร์ เพื่อแชร์ให้ทีม QA
- [ ] Import โฟลเดอร์ที่เหลือจาก tool เดิม (Spec Product - Ufriend, Incident Tracker)

## Phase 7 — Packaging

- [ ] Icon, version bump script, `npm run zip`
- [ ] (ถ้าต้องการให้ทีมใช้) Chrome Web Store แบบ Unlisted หรือแจก zip + Load unpacked

---

## Backlog / ไอเดีย

- Chip editor แบบเต็มรูป (แสดงคำสั่งเป็น chip) (แรงเยอะ — ทำหลัง Phase 2 ถ้ายังไม่พอ)
- `{if}` / `{repeat}` เงื่อนไขและวนซ้ำ
- รัน flow ข้าม iframe
- Assert step (`{expect: selector=...; text=...}`) — ใช้เป็น smoke test เบา ๆ
