# FastBlaze

Personal Chrome extension (MV3) for test-form work:
snippets, Thai test ID generator, and click automation. Reads/writes the
common snippet export format (v7 JSON: folders → snippets), so existing snippets import unchanged.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → pick this folder
3. Options page opens → **Settings → Import JSON** → choose your snippet export (.json)
4. Reload open tabs (or run a snippet from the popup; it injects itself)

After editing code: click ↻ on the extension card, then reload the page.

## Use

- Type a shortcut (e.g. `/lead`) in any field → expands. Works even in fields that
  reject `/` or letters (digit-only, masked, `type=number`): keystrokes are tracked
  and the field is restored to its value before the shortcut.
- Popup (`Alt+Shift+F`): search + run a snippet on the current page,
  generate/copy a Thai test ID.
- **Pick** (popup button or `Alt+Shift+P`): hover an element (yellow box), click it
  to get ranked selectors (stable / ok / fragile). The best command is copied and
  available as **Insert picked** in the editor. `↑`/`↓` = parent/child, `Esc` = cancel.
- **Blocks** view (default): an inline editor like a document. Type text directly;
  commands are chips (icon + key values) placed at the caret from the Dynamic commands
  panel. Drag a chip anywhere in the text, click it to edit in the panel (Update),
  Backspace or × removes it, Enter adds a line, pasting `{…}` text creates chips.
  **Code** view shows the raw template with syntax highlight.
- Selectors can pierce shadow DOM with `|>`: `{click: selector=#editor |> .input}`;
  Pick builds these automatically for elements inside web components.
- Options page: welcome page with a try-out box. Snippet editor with Label / Shortcut
  fields, **Try it out** popover, **Edit / Preview** switch, syntax-highlighted
  template, **Format** (one command per line using `\` line continuations, same
  output) / **Compact**, `{import: /…}` autocomplete, and a **Dynamic commands**
  panel (search, then a side-panel form with styled dropdowns builds the command).
  **Click element** has **Select from website**: the picker opens on your last tab and
  follows you to any tab you switch to; the chosen selector comes back to the editor.
  In Preview, click a step to jump to its source. The workspace is fixed; only the
  sidebar, editor and command panel scroll. Sidebar: collapsible folders, drag snippets to
  reorder or move between folders, right-click (or ⋯) menus for folders
  (new snippet, rename, sort, disable/enable, delete) and snippets (duplicate,
  move to folder, rename, delete). Disabled folders are listed separately and
  their shortcuts stop expanding.
- **Test data safe mode**: Settings has allow lists for phone numbers and bank
  accounts. When filled, `{thaiphone}` / `{bankaccount}` only use those values;
  `source=random` opts out (the form warns that random values may belong to real people).
- Settings: highlight on/off, pause per step, element timeout, key-click sound volume
  (snippet start + each automation click; 0 = off), Import / Export JSON.
  Appearance switch (System / Light / Dark) in the header.
- Running a flow shows a progress panel (bottom-left). **Esc** or **Stop** cancels.
  Failures name the step (`Step 14/26: click …`) and flash the element red.

## Template syntax

| Syntax | Meaning |
|---|---|
| `{thaiid}` / `{thaiid: prefix=8; format=dash}` | Valid Thai ID (test data) |
| `{random-number: min=0; max=9}` | Random integer (`rounded=no` → decimal) |
| `{thaiphone}` / `{thaiphone: type=landline; format=dash; prefix=064; source=random}` | From the Settings allow list; random Thai mobile / landline only when the list is empty or `source=random` |
| `{thainame}` / `{thainame: part=first; gender=male; lang=en; title=yes}` | Thai (or romanized) first / last / full name, optional นาย / นางสาว |
| `{email}` / `{email: base=qa; domain=example.com}` | Unique test address (default `example.com`, never delivers) |
| `{date}` / `{date: age=20-40; format=DDMMBBBB}` / `{date: shift=-3d}` | Today, shifted, or random birthday for an age range. Tokens: `BBBB`/`BB` พ.ศ., `YYYY`/`YY` ค.ศ., `MMMM`/`MMM` Thai month, `MM`, `DD` |
| `{zipcode}` `{bankaccount: format=dash}` `{randomtext: length=8; type=digits}` | Thai postal code, 10-digit account, random text |
| `{x=5}` `{y={random-number: min=1; max=9}}` | Variables |
| `{=x*2 + floor(y/3)}` | Expression (`& ` joins text) |
| `{formtext: name=a; default=b}` `{formmenu: default=A; B; name=m}` `{formparagraph}` | Ask before insert |
| `{import: /id}` | Insert another snippet |
| `{click: selector=CSS}` | Wait ≤5s for visible element, click; following text types into focus |
| `{click: text=Label}` | Click element whose visible text equals Label (`selector=` narrows the search) |
| `{click: …; maxdelay=3s}` | Wait up to this long for the element (default: Settings) |
| `{clear}` / `{clear: selector=CSS}` | Empty focused (or matched) field before typing |
| `{select: selector=CSS; value=10}` | Native `<select>` by `value=`, `text=` or `index=` |
| `{wait: 500ms}` `{key: enter\|tab\|escape\|up\|down}` | Pause / key press |
| `\{` `\\` | Literal brace / backslash |
| `\` at end of line | Line continuation (line break + next indent ignored) |

## Develop

```
npm test                     # engine unit tests (Node 18+)
python3 test-page/serve.py   # http://localhost:8765/test-page/?harness
```

`test-page/?harness` loads the content scripts with a `chrome.*` mock, so the
expansion, automation and picker can be tried without installing the extension.
`test-page/options-harness.html` opens the real Options page with the same mock.

## Layout

```
src/engine/   expr (safe evaluator), parser, thaiid, runner (template → actions)
src/content/  dom (insert/click/wait), ui (form dialog, toast), selector + picker, content (triggers)
src/shared/   storage (chrome.storage + JSON import/export), defaults, tabs, theme, base.css (brand tokens)
src/popup/    toolbar popup
src/options/  snippet manager
```
