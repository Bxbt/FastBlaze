# FastBlaze Roadmap

สถานะ: v0.2 — Phase 1 เสร็จ (flow เสถียร, settings, logo)
ลำดับด้านล่างเรียงตาม "คุ้มค่า / แรงที่ใช้" — ทำทีละ phase, แต่ละ phase ใช้งานได้จริงเมื่อจบ

---

## Phase 1 — ความเสถียรตอนรัน flow (ทำก่อน, ~0.5–1 วัน)

ปัญหาที่จะเจอจริงบนเว็บ Ufriend ก่อนเรื่อง UI

- [x] **บอกว่าพังที่ขั้นไหน** — toast แสดง `Step 14/26: click .overflow-auto > :nth-child(1)` + สาเหตุ
- [x] **ปุ่มหยุด / กด Esc ยกเลิก flow** ระหว่างรัน + แถบ progress มุมซ้ายล่าง
- [x] **`{clear}`** — ล้างค่าในช่องก่อนพิมพ์ (ตอนนี้ต่อท้ายค่าเดิม เหมือน Text Blaze)
- [x] **`{select: selector=...; value=...}`** — รองรับ `<select>` ธรรมดา (value / text / index)
- [x] **Settings**: เปิด/ปิด highlight, ความเร็วต่อ step, timeout รอ element
- [x] Highlight สีแดงที่ element ที่พังเมื่อ flow ล้ม
- [x] Logo + icon 16/32/48/128

## Phase 2 — Editor อ่านง่าย (~1 วัน)

- [ ] Syntax highlight ใน template (click = ฟ้า, form = เขียว, text = ปกติ, error = แดง)
- [ ] ปุ่ม "Format" — แสดง 1 คำสั่งต่อบรรทัด (ขึ้นบรรทัดเฉพาะที่แสดง ไม่กระทบตอนรัน)
- [ ] Sidebar แทรกคำสั่ง: click / formtext / formmenu / thaiid / random / wait / key / import
- [ ] Autocomplete `{import: /` → รายชื่อ shortcut
- [ ] ช่อง "Try it out" ในหน้า Options (พิมพ์ shortcut ทดลองได้เลย)
- [ ] กด step ใน Preview → กระโดดไปตำแหน่งใน template

## Phase 3 — Element picker (~1 วัน) ⭐ คุ้มที่สุดสำหรับ automation

- [ ] ปุ่ม "Pick element" ใน popup → hover บนเว็บ = กรอบเหลือง, คลิก = ได้ selector
- [ ] ลำดับการสร้าง selector (เลือกตัวที่ unique และเสถียรที่สุด):
      `data-testid` → `id` → `name` / `aria-label` / `placeholder` → ข้อความใน option → class path สั้นสุด
- [ ] เตือนเมื่อ selector อิง class Tailwind (เปราะ)
- [ ] ส่ง `{click: selector=...}` กลับไปแทรกใน editor / copy ไว้

## Phase 4 — Record mode (~2–3 วัน)

- [ ] กดอัด → ทำงานบนเว็บตามปกติ → กดหยุด → ได้ snippet ทั้ง flow
- [ ] จับ click, การพิมพ์ (รวมเป็น text ก้อนเดียวต่อช่อง), เลือก dropdown, key Enter/Tab
- [ ] แปลงค่าที่พิมพ์ให้เป็นคำสั่งได้ (เช่น เลขบัตร → `{thaiid}`, ชื่อ → `{formtext}`)
- [ ] ใช้ selector engine เดียวกับ Phase 3

## Phase 5 — Test data generators (~0.5 วัน)

- [ ] `{thaiphone}` เบอร์มือถือ 06/08/09, `{thainame}` ชื่อ-นามสกุลไทยสุ่ม, `{email}`
- [ ] `{date: format=DDMMYYYY; era=be; shift=-25y}` รองรับปี พ.ศ. (ใช้กับ date-of-birth)
- [ ] `{clipboard}`, `{cursor}` แบบ Text Blaze

## Phase 6 — Data & การแชร์ (~0.5–1 วัน)

- [ ] Backup อัตโนมัติ / `chrome.storage.sync` (ข้ามเครื่อง, จำกัด ~100KB)
- [ ] Export รายโฟลเดอร์ เพื่อแชร์ให้ทีม QA
- [ ] Import โฟลเดอร์ที่เหลือจาก Text Blaze (Spec Product - Ufriend, Incident Tracker)

## Phase 7 — Packaging

- [ ] Icon, version bump script, `npm run zip`
- [ ] (ถ้าต้องการให้ทีมใช้) Chrome Web Store แบบ Unlisted หรือแจก zip + Load unpacked

---

## Backlog / ไอเดีย

- Chip editor แบบ Text Blaze เต็มรูป (แรงเยอะ — ทำหลัง Phase 2 ถ้ายังไม่พอ)
- `{if}` / `{repeat}` เงื่อนไขและวนซ้ำ
- รัน flow ข้าม iframe
- Assert step (`{expect: selector=...; text=...}`) — ใช้เป็น smoke test เบา ๆ
