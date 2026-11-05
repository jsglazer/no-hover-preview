---
Version: 1.0.0
Closed: 2026-11-04 21:15
---
# Claude output

## 2026-11-04 — Initial build (v1.0.0)

**Prompt:** like many people I *hate* the auto-preview popup feature built into many PDF readers. It is especially annoying in Zotero. See this thread `https://forums.zotero.org/discussion/116479/disable-the-pop-up-window-when-hovering-over-citation-links/p2`. Can you build a plugin that block the popup behavior? Example: mouse-over the header and that box with the TOC pops up [screenshot of heading hover showing a TOC page preview].

**Research:** The forum thread has no pref or workaround, only user requests. Extracted Zotero 10.0.7's `omni.ja` and read `resource/reader/reader.js`. All hover popups go through `onSetOverlayPopup(popup)` → internal reader `_updateState({primaryViewOverlayPopup|secondaryViewOverlayPopup})`, typed `internal-link` (PDF page preview, which is the popup in the screenshot), `citation`, `reference`, `footnote` (plus `external-link`/`image`, which are not hover previews and are left alone). React components: `.preview-popup`, `.citation-popup`, `.reference-popup`, `.footnote-popup`.

**Build:** Plain bootstrap plugin (no scaffold/toolchain): `addon/bootstrap.js`, `manifest.json`, `prefs.js`, `content/preferences.xhtml`; `build.sh` zips to `no-hover-preview.xpi`; `test/filter.test.mjs` runs the patch against a mock reader (all passing). Repo created private at https://github.com/jsglazer/no-hover-preview.

| # | Issue | Fix |
|---|---|---|
| 1 | Zotero reader shows page/citation/reference/footnote previews on hover with no way to turn them off | `bootstrap.js` shadows `_updateState` on each reader's internal reader (via `exportFunction`) and nulls overlay popups of blocked types before they render; hooked through `renderToolbar` + `_initPromise`, plus already-open readers at startup |
| 2 | Need per-type control and a future-proof fallback | Prefs `extensions.zotero.nohoverpreview.{enabled,block.internalLink,block.citation,block.reference,block.footnote}` read live; settings pane with checkboxes; CSS `display:none` fallback injected into the reader document and refreshed on pref change |
| 3 | `Zotero.Prefs.registerObserver` matches exact pref names, not a branch prefix | Register one observer per pref |
| 4 | Clean disable/uninstall | `shutdown()` deletes the own-property `_updateState` (restoring the prototype method), removes the stylesheet, unregisters listeners/observers |

### Summary

I built **No Hover Preview** (v1.0.0), a Zotero plugin that suppresses the reader's hover popups. It lives in `/Users/josh/Dev/2-Projects/Zotero/no-hover-preview` and is pushed to a **private** repo at github.com/jsglazer/no-hover-preview.

**How it works.** I read the reader code bundled in your Zotero 10.0.7. Every hover popup goes through one internal state update, tagged with a type. The TOC box in your screenshot is an `internal-link` page preview. The plugin intercepts that update and drops the popup before it draws. Clicking a link still jumps to its target. A CSS rule that hides the popup boxes acts as a backup in case a future Zotero renames things.

**Settings.** Under Settings → No Hover Preview there is a master switch plus a checkbox for each type: internal links, citations, references and footnotes. All are on by default, and changes apply instantly.

**Verification.** The filter logic passes a unit test against a mock reader (`node test/filter.test.mjs`). I haven't tested it in your running Zotero, because installing it there means touching your live app.

To try it, use Tools → Plugins → gear → Install Plugin From File… and pick `/Users/josh/Dev/2-Projects/Zotero/no-hover-preview/no-hover-preview.xpi`. Then hover over that heading again.

**Your call:**
- I made the repo private because creating a public repo felt like your decision. To publish it, run `gh repo edit jsglazer/no-hover-preview --visibility public --accept-visibility-change-consequences`. The plugin's auto-update URL only works once the repo is public and has a release.
- I used a plain bootstrap plugin instead of your usual scaffold/TypeScript pipeline, since the whole thing is about 180 lines. I didn't create a VaultDEV Dev file; this log is in the project folder.
- If you'd rather peek at a preview occasionally than turn them off for good, I can add a hold-⌥-to-preview override.
