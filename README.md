# FastBlaze

Personal Chrome extension (MV3) replacing Text Blaze for test-form work:
snippets, Thai test ID generator, and click automation. Reads/writes the
Text Blaze export format, so existing snippets import unchanged.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → pick this folder
3. Options page opens → **Import JSON** → choose your Text Blaze export
4. Reload open tabs (or run a snippet from the popup; it injects itself)

After editing code: click ↻ on the extension card, then reload the page.

## Use

- Type a shortcut (e.g. `/lead`) in any field → expands.
- Popup (`Alt+Shift+F`): search + run a snippet on the current page,
  generate/copy a Thai test ID.
- Options page: edit snippets, live preview of the action list, import/export,
  ⚙ Settings (highlight on/off, pause per step, element timeout).
- Running a flow shows a progress panel (bottom-left). **Esc** or **Stop** cancels.
  Failures name the step (`Step 14/26: click …`) and flash the element red.

## Template syntax

| Syntax | Meaning |
|---|---|
| `{thaiid}` / `{thaiid: prefix=8; format=dash}` | Valid Thai ID (test data) |
| `{random-number: min=0; max=9}` | Random integer (`rounded=no` → decimal) |
| `{x=5}` `{y={random-number: min=1; max=9}}` | Variables |
| `{=x*2 + floor(y/3)}` | Expression (`& ` joins text) |
| `{formtext: name=a; default=b}` `{formmenu: default=A; B; name=m}` `{formparagraph}` | Ask before insert |
| `{import: /id}` | Insert another snippet |
| `{click: selector=CSS}` | Wait ≤5s for visible element, click; following text types into focus |
| `{clear}` / `{clear: selector=CSS}` | Empty focused (or matched) field before typing |
| `{select: selector=CSS; value=10}` | Native `<select>` by `value=`, `text=` or `index=` |
| `{wait: 500ms}` `{key: enter\|tab\|escape\|up\|down}` | Pause / key press |
| `\{` `\\` | Literal brace / backslash |

## Develop

```
npm test                     # engine unit tests (Node 18+)
python3 -m http.server 8765  # then open /test-page/?harness
```

`test-page/?harness` loads the content scripts with a `chrome.*` mock, so the
expansion and automation can be tried without installing the extension.

## Layout

```
src/engine/   expr (safe evaluator), parser, thaiid, runner (template → actions)
src/content/  dom (insert/click/wait), ui (form dialog, toast), content (triggers)
src/shared/   storage (chrome.storage + Text Blaze import/export), defaults
src/popup/    toolbar popup
src/options/  snippet manager
```
