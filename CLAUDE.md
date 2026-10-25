# LearNew (SmartLearn)

Single-file PWA (`index.html` + `sw.js`) that builds personal courses with the Google Gemini API.

## Versioning
On every change, bump the version in **both** places, keeping them equal:
- `sw.js`: `CACHE_NAME = 'smartlearn-cache-vN'`
- `index.html` header: `<span ...>vN</span>` next to "SmartLearn"

## Dark mode
Markup uses Tailwind's light-theme color classes; the `html.dark` CSS block in `index.html` remaps each one for dark mode.
When adding a color class with no rule there (including a `hover:`/`focus:` variant on top of a remapped class), add one.
