# No Hover Preview

A Zotero 7+ plugin that stops the built-in reader from popping up preview boxes when your mouse passes over a link: the page previews on internal links (TOC entries, headings, figure and equation references), the citation and reference popups, and EPUB/snapshot footnote popups.

Clicking a link still takes you to its target. Only the hover popup is suppressed.

Want to peek at one? **Hold Option ⌥ (Alt on Windows/Linux)** while hovering over a link, or press it while you're already hovering, and the preview appears. A preview shown this way stays open, so you can move into it and scroll, until you move off it. The next hover is hidden again.

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

All are on by default. **Hold to show previews** picks the override key: Option/Alt (default), Shift, Control, Command/Win, or None to never show them. Changes take effect immediately, with no restart.

On Windows, tapping and releasing Alt by itself can focus the menu bar, so pick Shift or Control there if that gets in the way.

## How it works

Every hover popup in the reader goes through the internal reader's `_updateState({ primaryViewOverlayPopup | secondaryViewOverlayPopup })`, tagged with a `type` (`internal-link`, `citation`, `reference`, `footnote`), and renders as an element with a matching class (`.preview-popup`, `.citation-popup`, `.reference-popup`, `.footnote-popup`).

- **With an override key (default):** popups open as normal, but a stylesheet injected into the reader hides them unless the reader's root has the `nhp-reveal` class. Holding the key adds that class. When it's released, a popup that's already showing stays visible until Zotero closes it, then the class clears. Zotero's own open and close timing stays intact.
- **With the override set to None:** the plugin wraps `_updateState` on each reader and drops blocked popups before they render, so no preview image is ever drawn. The stylesheet stays on as a fallback.

Disabling or removing the plugin restores the original behaviour in open readers without a restart.

## Development

```sh
./build.sh                      # package addon/ into no-hover-preview.xpi
node test/filter.test.mjs       # unit-test the popup filter against a mock reader
```

Tested against Zotero 10.0.7.

## License

MIT
