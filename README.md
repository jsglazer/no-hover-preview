# No Hover Preview

A Zotero 7+ plugin that stops the built-in reader from popping up preview boxes when your mouse passes over a link: the page previews on internal links (TOC entries, headings, figure and equation references), the citation and reference popups, and EPUB/snapshot footnote popups.

Clicking a link still takes you to its target. Only the hover popup is suppressed.

Background: [Zotero forums: Disable the pop-up window when hovering over citation links](https://forums.zotero.org/discussion/116479/disable-the-pop-up-window-when-hovering-over-citation-links).

## Install

1. Download `no-hover-preview.xpi` from the latest release, or build it with `./build.sh`.
2. In Zotero, open **Tools → Plugins**, click the gear menu, and pick **Install Plugin From File…**.

## Settings

**Settings → No Hover Preview** has a master switch and one checkbox per popup type:

| Setting | Popup it blocks |
|---|---|
| Internal links | Page-image previews when hovering over in-document links (TOC, headings, "see Figure 3") |
| Citations | In-text citation → matched reference popups |
| References | Bibliography entry popups |
| Footnotes | EPUB / web snapshot footnote popups |

All are on by default. Changes take effect immediately, with no restart.

## How it works

Every hover popup in the reader goes through the internal reader's `_updateState({ primaryViewOverlayPopup | secondaryViewOverlayPopup })`, tagged with a `type` (`internal-link`, `citation`, `reference`, `footnote`). The plugin wraps `_updateState` on each open reader and drops popups of the blocked types before they render. As a fallback, if a future Zotero version changes that path, it also injects a stylesheet into the reader that hides the matching popup classes (`.preview-popup`, `.citation-popup`, `.reference-popup`, `.footnote-popup`).

Disabling or removing the plugin restores the original behaviour in open readers without a restart.

## Development

```sh
./build.sh                      # package addon/ into no-hover-preview.xpi
node test/filter.test.mjs       # unit-test the popup filter against a mock reader
```

Tested against Zotero 10.0.7.

## License

MIT
