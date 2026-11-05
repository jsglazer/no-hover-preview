/* No Hover Preview — stops the Zotero reader's hover preview popups.
 *
 * How it works: every hover popup in the reader (PDF internal-link page previews, citation/reference popups, EPUB/snapshot footnotes) is opened by the view calling onSetOverlayPopup(popup), which lands in the internal reader's `_updateState({ primaryViewOverlayPopup | secondaryViewOverlayPopup: popup })`. We shadow `_updateState` on each reader instance and null out popups whose `type` is blocked, so the popup is never rendered. Clicking a link is a separate code path and keeps working.
 *
 * Belt and braces: a stylesheet in the reader document also hides the matching popup classes, in case a future Zotero renames the state keys.
 */

const PLUGIN_ID = "no-hover-preview@jsglazer.com";
const PREF_PREFIX = "extensions.zotero.nohoverpreview.";
const STATE_KEYS = ["primaryViewOverlayPopup", "secondaryViewOverlayPopup"];
const STYLE_ID = "nohoverpreview-style";

// overlay popup type -> [pref suffix, popup CSS class]
const TYPES = {
  "internal-link": ["block.internalLink", "preview-popup"],
  citation: ["block.citation", "citation-popup"],
  reference: ["block.reference", "reference-popup"],
  footnote: ["block.footnote", "footnote-popup"],
};

let prefObserverIDs = [];
let paneID = null;
let rootURI = null;

function getPref(key) {
  return Zotero.Prefs.get(PREF_PREFIX + key, true);
}

function isBlocked(type) {
  if (!getPref("enabled")) return false;
  const entry = TYPES[type];
  return !!entry && getPref(entry[0]) !== false;
}

function log(msg) {
  Zotero.debug("[No Hover Preview] " + msg);
}

function cssText() {
  if (!getPref("enabled")) return "";
  return Object.values(TYPES)
    .filter(([pref]) => getPref(pref) !== false)
    .map(([, cls]) => `.${cls}{display:none !important}`)
    .join("\n");
}

function applyStyle(reader) {
  try {
    const doc = reader._iframeWindow && reader._iframeWindow.document;
    if (!doc || !doc.documentElement) return;
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
  try {
    const doc = reader._iframeWindow && reader._iframeWindow.document;
    const style = doc && doc.getElementById(STYLE_ID);
    if (style) style.remove();
  } catch (e) {
    /* reader already gone */
  }
}

function patchReader(reader) {
  try {
    const ir = reader._internalReader; // already an X-ray-waived content object
    const win = reader._iframeWindow;
    if (!ir || !win || ir.__noHoverPreviewPatched) {
      applyStyle(reader);
      return;
    }
    const original = ir._updateState;
    if (typeof original !== "function") {
      log("internal reader has no _updateState; relying on CSS fallback only");
      applyStyle(reader);
      return;
    }
    const wrapper = function (state, init) {
      try {
        if (state) {
          for (const key of STATE_KEYS) {
            const popup = state[key];
            if (popup && isBlocked(popup.type)) state[key] = null;
          }
        }
      } catch (e) {
        log("filter error: " + e);
      }
      return original.call(ir, state, init);
    };
    ir._updateState = Components.utils.exportFunction(wrapper, win);
    ir.__noHoverPreviewPatched = true;
    applyStyle(reader);
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

function allReaders() {
  return (Zotero.Reader && Zotero.Reader._readers) || [];
}

function onPrefChange() {
  for (const reader of allReaders()) applyStyle(reader);
}

// ---- bootstrap lifecycle -------------------------------------------------

function install() {}

async function startup({ id, version, rootURI: uri }) {
  rootURI = uri;
  await Zotero.initializationPromise;

  Zotero.Reader.registerEventListener("renderToolbar", onRenderToolbar, PLUGIN_ID);
  for (const reader of allReaders()) {
    if (reader._initPromise) reader._initPromise.then(() => patchReader(reader)).catch(() => {});
  }

  // Zotero.Prefs observers match exact pref names, so register one per pref
  for (const key of ["enabled", ...Object.values(TYPES).map(([pref]) => pref)]) {
    prefObserverIDs.push(Zotero.Prefs.registerObserver(PREF_PREFIX + key, onPrefChange, true));
  }

  try {
    paneID = await Zotero.PreferencePanes.register({
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
  for (const reader of allReaders()) unpatchReader(reader);
}

function uninstall() {}
