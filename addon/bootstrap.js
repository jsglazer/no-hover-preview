/* No Hover Preview — stops the Zotero reader's hover preview popups.
 *
 * Every hover popup in the reader (PDF internal-link page previews, citation/reference popups, EPUB/snapshot footnotes) is opened by the view calling onSetOverlayPopup(popup), which lands in the internal reader's `_updateState({ primaryViewOverlayPopup | secondaryViewOverlayPopup: popup })`. The popup is a React element in the reader document with a per-type class (.preview-popup, .citation-popup, ...).
 *
 * Two modes:
 * - Override key set (default: Option/Alt). Popups open as usual but a stylesheet hides them. Holding the key adds `nhp-reveal` to the reader's root, which un-hides them. Zotero keeps its own open/close timing, so a popup revealed by a tap stays visible until Zotero closes it (pointer leaves), and the reveal clears once no popup is left. A blocked popup can't be replayed later, because Zotero never reports that the pointer left a link whose popup was suppressed, so hiding beats blocking here.
 * - Override key "none". We shadow `_updateState` and drop blocked popups before they render (no page-preview rendering at all). The stylesheet stays as a fallback in case a future Zotero renames the state keys.
 */

const PLUGIN_ID = "no-hover-preview@jsglazer.com";
const PREF_PREFIX = "extensions.zotero.nohoverpreview.";
const STATE_KEYS = ["primaryViewOverlayPopup", "secondaryViewOverlayPopup"];
const STYLE_ID = "nohoverpreview-style";
const REVEAL_CLASS = "nhp-reveal";

// overlay popup type -> [pref suffix, popup CSS class]
const TYPES = {
  "internal-link": ["block.internalLink", "preview-popup"],
  citation: ["block.citation", "citation-popup"],
  reference: ["block.reference", "reference-popup"],
  footnote: ["block.footnote", "footnote-popup"],
};

// override pref value -> [KeyboardEvent.key, modifier flag on mouse/key events]
const OVERRIDE_KEYS = {
  alt: ["Alt", "altKey"],
  shift: ["Shift", "shiftKey"],
  ctrl: ["Control", "ctrlKey"],
  meta: ["Meta", "metaKey"],
};

let prefObserverIDs = [];
let rootURI = null;
let held = false; // override key currently down
const hookedWindows = new Set(); // windows carrying our key/mouse listeners
const observers = new Map(); // reader document -> MutationObserver

function getPref(key) {
  return Zotero.Prefs.get(PREF_PREFIX + key, true);
}

function overrideKey() {
  return OVERRIDE_KEYS[getPref("override.key")] || null;
}

function blockedClasses() {
  if (!getPref("enabled")) return [];
  return Object.values(TYPES)
    .filter(([pref]) => getPref(pref) !== false)
    .map(([, cls]) => cls);
}

// Drop the popup at state level only when there is no override key; with an override the popup must exist so the key can reveal it.
function shouldDrop(type) {
  if (!getPref("enabled") || overrideKey()) return false;
  const entry = TYPES[type];
  return !!entry && getPref(entry[0]) !== false;
}

function log(msg) {
  Zotero.debug("[No Hover Preview] " + msg);
}

function cssText() {
  return blockedClasses()
    .map((cls) => `:root:not(.${REVEAL_CLASS}) .${cls}{display:none !important}`)
    .join("\n");
}

function readerDoc(reader) {
  try {
    const doc = reader._iframeWindow && reader._iframeWindow.document;
    return doc && doc.documentElement ? doc : null;
  } catch (e) {
    return null; // reader closed
  }
}

function allReaders() {
  return (Zotero.Reader && Zotero.Reader._readers) || [];
}

// ---- stylesheet ----------------------------------------------------------

function applyStyle(reader) {
  const doc = readerDoc(reader);
  if (!doc) return;
  try {
    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = cssText();
  } catch (e) {
    log("applyStyle failed: " + e);
  }
}

function removeStyle(reader) {
  const doc = readerDoc(reader);
  if (!doc) return;
  const style = doc.getElementById(STYLE_ID);
  if (style) style.remove();
  doc.documentElement.classList.remove(REVEAL_CLASS);
}

// ---- override key --------------------------------------------------------

function popupPresent(doc) {
  const classes = blockedClasses();
  return classes.length > 0 && !!doc.querySelector(classes.map((c) => "." + c).join(","));
}

// Reveal while the key is held; after release keep an already-revealed popup visible until Zotero closes it.
function syncReveal(doc) {
  const root = doc.documentElement;
  if (held) root.classList.add(REVEAL_CLASS);
  else if (root.classList.contains(REVEAL_CLASS) && !popupPresent(doc)) root.classList.remove(REVEAL_CLASS);
}

function syncAllReaders() {
  for (const reader of allReaders()) {
    const doc = readerDoc(reader);
    if (doc) syncReveal(doc);
  }
}

function setHeld(value) {
  if (held === value) return;
  held = value;
  syncAllReaders();
}

function onKeyDown(e) {
  const ok = overrideKey();
  if (ok && e.key === ok[0]) setHeld(true);
}

function onKeyUp(e) {
  const ok = overrideKey();
  if (ok && e.key === ok[0]) setHeld(false);
}

// Mouse events carry modifier state, which corrects `held` if a keyup was missed (e.g. released while another app had focus).
function onMouseMove(e) {
  const ok = overrideKey();
  if (ok && e[ok[1]] !== held) setHeld(!!e[ok[1]]);
}

function onBlur() {
  setHeld(false);
}

const WINDOW_LISTENERS = [
  ["keydown", onKeyDown],
  ["keyup", onKeyUp],
  ["mousemove", onMouseMove],
  ["blur", onBlur],
];

// Capture-phase listeners on the chrome window see events from the reader iframe and its nested view iframes (in-process frames propagate to the chrome event handler). The reader iframe itself is hooked too, as a fallback.
function hookWindow(win) {
  if (!win || hookedWindows.has(win)) return;
  for (const [type, fn] of WINDOW_LISTENERS) win.addEventListener(type, fn, true);
  hookedWindows.add(win);
}

function unhookWindows() {
  for (const win of hookedWindows) {
    try {
      for (const [type, fn] of WINDOW_LISTENERS) win.removeEventListener(type, fn, true);
    } catch (e) {
      /* window gone */
    }
  }
  hookedWindows.clear();
}

function observeDoc(doc) {
  if (observers.has(doc)) return;
  const win = doc.defaultView;
  const mo = new win.MutationObserver(() => {
    if (!held && doc.documentElement.classList.contains(REVEAL_CLASS)) syncReveal(doc);
  });
  mo.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
  observers.set(doc, mo);
  win.addEventListener("unload", () => {
    mo.disconnect();
    observers.delete(doc);
    hookedWindows.delete(win);
  }, { once: true });
}

// ---- reader patching -----------------------------------------------------

function patchReader(reader) {
  try {
    const ir = reader._internalReader; // already an X-ray-waived content object
    const win = reader._iframeWindow;
    if (!ir || !win) return;
    applyStyle(reader);
    hookWindow(reader._window);
    hookWindow(win);
    const doc = readerDoc(reader);
    if (doc) observeDoc(doc);
    if (ir.__noHoverPreviewPatched) return;
    const original = ir._updateState;
    if (typeof original !== "function") {
      log("internal reader has no _updateState; relying on CSS only");
      return;
    }
    const wrapper = function (state, init) {
      try {
        if (state) {
          for (const key of STATE_KEYS) {
            const popup = state[key];
            if (popup && shouldDrop(popup.type)) state[key] = null;
          }
        }
      } catch (e) {
        log("filter error: " + e);
      }
      return original.call(ir, state, init);
    };
    ir._updateState = Components.utils.exportFunction(wrapper, win);
    ir.__noHoverPreviewPatched = true;
    log("patched reader " + reader._instanceID);
  } catch (e) {
    log("patchReader failed: " + e);
  }
}

function unpatchReader(reader) {
  try {
    const ir = reader._internalReader;
    if (ir && ir.__noHoverPreviewPatched) {
      // _updateState is a prototype method; deleting the own property restores it
      delete ir._updateState;
      delete ir.__noHoverPreviewPatched;
    }
  } catch (e) {
    /* reader already gone */
  }
  removeStyle(reader);
}

function onRenderToolbar(event) {
  const reader = event.reader;
  if (!reader || !reader._initPromise) return;
  reader._initPromise.then(() => patchReader(reader)).catch(() => {});
}

function onPrefChange() {
  held = false;
  for (const reader of allReaders()) {
    applyStyle(reader);
    const doc = readerDoc(reader);
    if (doc) syncReveal(doc);
  }
}

// ---- bootstrap lifecycle -------------------------------------------------

function install() {}

async function startup({ version, rootURI: uri }) {
  rootURI = uri;
  await Zotero.initializationPromise;

  Zotero.Reader.registerEventListener("renderToolbar", onRenderToolbar, PLUGIN_ID);
  for (const reader of allReaders()) {
    if (reader._initPromise) reader._initPromise.then(() => patchReader(reader)).catch(() => {});
  }

  // Zotero.Prefs observers match exact pref names, so register one per pref
  const prefKeys = ["enabled", "override.key", ...Object.values(TYPES).map(([pref]) => pref)];
  for (const key of prefKeys) {
    prefObserverIDs.push(Zotero.Prefs.registerObserver(PREF_PREFIX + key, onPrefChange, true));
  }

  try {
    await Zotero.PreferencePanes.register({
      pluginID: PLUGIN_ID,
      src: rootURI + "content/preferences.xhtml",
      label: "No Hover Preview",
    });
  } catch (e) {
    log("pref pane registration failed: " + e);
  }
  log("started v" + version);
}

function onMainWindowLoad() {}
function onMainWindowUnload() {}

function shutdown() {
  try {
    Zotero.Reader.unregisterEventListener("renderToolbar", onRenderToolbar);
  } catch (e) {
    /* ignore */
  }
  for (const sym of prefObserverIDs) Zotero.Prefs.unregisterObserver(sym);
  prefObserverIDs = [];
  unhookWindows();
  for (const mo of observers.values()) mo.disconnect();
  observers.clear();
  for (const reader of allReaders()) unpatchReader(reader);
}

function uninstall() {}
