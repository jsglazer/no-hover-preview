# No Hover Preview

A Zotero 7+ plugin that keeps the built-in reader from getting in your way when the mouse is over a link. It does two things:

- **Block preview:** no preview boxes when the mouse passes over a link. That covers page previews on internal links (TOC entries, headings, figure and equation references), citation and reference popups, and EPUB/snapshot footnote popups. To see one anyway, **hold Control ⌃** while the mouse is over the link, or press it once you're already there. A preview shown this way stays open, so you can move into it and scroll, until you move off it.
- **Block navigation:** a plain click on a link does nothing, so selecting text or clicking near a link won't throw you to another page or open a browser. To follow a link, **Shift-click** it.

Both are on by default, and each modifier key can be changed.

Background: [Zotero forums: Disable the pop-up window when hovering over citation links](https://forums.zotero.org/discussion/116479/disable-the-pop-up-window-when-hovering-over-citation-links).

## Install

1. Download `no-hover-preview.xpi` from the latest release, or build it with `./build.sh`.
2. In Zotero, open **Tools → Plugins**, click the gear menu, and pick **Install Plugin From File…**.

## Settings

**Settings → No Hover Preview** has two sections.

**Block preview** (default on) has a checkbox for each popup type:

| Setting | Popup it blocks |
|---|---|
| Internal links | Page-image previews when hovering over in-document links (TOC, headings, "see Figure 3") |
| Citations | In-text citation → matched reference popups |
| References | Bibliography entry popups |
| Footnotes | EPUB / web snapshot footnote popups |

**Show a preview when holding** picks the key: Control (default), Option/Alt, Shift, Command/Win, or None to never show previews.

**Block navigation** (default on) has two checkboxes:

| Setting | Click it blocks |
|---|---|
| Internal links and citations | Jumping to another page or to the cited reference |
| Web links | Opening the URL in your browser |

**Follow a link when clicking with** picks the key: Shift (default), Option/Alt, Command/Win, Control, or None to never follow links on click. On macOS, Control-click opens the context menu, so Control isn't a good choice there.

Some navigation is never blocked: outline, thumbnail and annotation jumps in the sidebar, keyboard navigation, back/forward, and right-click → Open Link.

All settings are on by default and take effect immediately, with no restart.

## How it works

Every hover popup in the reader goes through the internal reader's `_updateState({ primaryViewOverlayPopup | secondaryViewOverlayPopup })`, tagged with a `type` (`internal-link`, `citation`, `reference`, `footnote`), and renders as an element with a matching class (`.preview-popup`, `.citation-popup`, `.reference-popup`, `.footnote-popup`).

- **With an override key (default):** popups open as normal, but a stylesheet injected into the reader hides them unless the reader's root has the `nhp-reveal` class. Holding the key adds that class. When it's released, a popup that's already showing stays visible until Zotero closes it, then the class clears. Zotero's own open and close timing stays intact.
- **With the override set to None:** the plugin wraps `_updateState` on each reader and drops blocked popups before they render, so no preview image is ever drawn. The stylesheet stays on as a fallback.

Navigation: a link click reaches the page view synchronously. In a PDF, a `pointerup` handler calls `view.navigate()` for internal links and citations, or `view._onOpenLink(url)` for web links. In EPUB and snapshots, a `click` handler calls `navigate({href})` or `_options.onOpenLink(url)`. The plugin wraps these on each view, including views created later for split view. Each wrapped call checks the event being dispatched: it blocks only when that event is a click or `pointerup` whose target is inside the page view and the navigation key isn't held. Calls made outside a page click, such as sidebar jumps, keyboard navigation and history, pass straight through.

Disabling or removing the plugin restores the original behaviour in open readers without a restart.

## Development

```sh
./build.sh                      # package addon/ into no-hover-preview.xpi
node test/filter.test.mjs       # unit-test the popup and navigation blocking against a mock reader
```

Tested against Zotero 10.0.7.

## License

MIT
