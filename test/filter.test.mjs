// Exercises bootstrap.js against a fake reader that mirrors the real one's _updateState flow and popup DOM.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const P = "extensions.zotero.nohoverpreview.";
const prefs = { [P + "enabled"]: true, [P + "block.internalLink"]: true, [P + "block.citation"]: false, [P + "block.reference"]: true, [P + "block.footnote"]: true, [P + "override.key"]: "none" };

const ctx = {
  Zotero: { Prefs: { get: (k) => prefs[k] }, debug: () => {}, Reader: { _readers: [] } },
  Components: { utils: { exportFunction: (f) => f } },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../addon/bootstrap.js", import.meta.url), "utf8"), ctx);
const fn = (name) => vm.runInContext(name, ctx);

// --- fakes ---
function fakeWindow() {
  const listeners = {};
  return {
    listeners,
    addEventListener: (t, f) => ((listeners[t] ||= []).push(f)),
    removeEventListener: (t, f) => (listeners[t] = (listeners[t] || []).filter((x) => x !== f)),
    fire(t, e) { for (const f of listeners[t] || []) f(e); },
    MutationObserver: class { constructor(cb) { fakeWindow.moCallback = cb; } observe() {} disconnect() {} },
  };
}
const classes = new Set();
const popups = new Set(); // CSS classes of popups currently in the DOM
let styleEl = null;
const iframeWin = fakeWindow();
const doc = {
  defaultView: iframeWin,
  documentElement: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) } },
  head: { appendChild: (el) => (styleEl = el) },
  body: {},
  getElementById: (id) => (styleEl && styleEl.id === id ? styleEl : null),
  createElement: () => ({ remove() { styleEl = null; } }),
  querySelector: (sel) => (sel.split(",").some((s) => popups.has(s.slice(1))) ? {} : null),
};
iframeWin.document = doc;
const chromeWin = fakeWindow();

class InternalReader { constructor() { this.state = {}; } _updateState(s) { this.state = { ...this.state, ...s }; } }
const reader = { _internalReader: new InternalReader(), _iframeWindow: iframeWin, _window: chromeWin, _instanceID: "t" };
ctx.Zotero.Reader._readers.push(reader);
fn("patchReader")(reader);
const ir = reader._internalReader;

// --- mode 1: no override key -> drop at state level ---
ir._updateState({ primaryViewOverlayPopup: { type: "internal-link" } });
assert.equal(ir.state.primaryViewOverlayPopup, null, "internal-link dropped");
ir._updateState({ secondaryViewOverlayPopup: { type: "reference" } });
assert.equal(ir.state.secondaryViewOverlayPopup, null, "reference dropped in split view");
ir._updateState({ primaryViewOverlayPopup: { type: "citation" } });
assert.equal(ir.state.primaryViewOverlayPopup.type, "citation", "citation allowed when its pref is off");
ir._updateState({ primaryViewOverlayPopup: { type: "external-link" } });
assert.equal(ir.state.primaryViewOverlayPopup.type, "external-link", "unlisted types untouched");
ir._updateState({ annotations: [1] });
assert.deepEqual(ir.state.annotations, [1], "other state passes through");
assert.match(styleEl.textContent, /:root:not\(\.nhp-reveal\) \.preview-popup\{display:none/, "CSS hides blocked classes");
assert.doesNotMatch(styleEl.textContent, /citation-popup/, "CSS skips allowed types");

// --- mode 2: override key -> popups pass through, CSS hides, key reveals ---
prefs[P + "override.key"] = "alt";
fn("onPrefChange")();
ir._updateState({ primaryViewOverlayPopup: { type: "internal-link" } });
assert.equal(ir.state.primaryViewOverlayPopup.type, "internal-link", "with override, popup reaches the reader (hidden by CSS)");
popups.add("preview-popup");
assert.equal(classes.has("nhp-reveal"), false, "hidden until key pressed");
chromeWin.fire("keydown", { key: "Alt" });
assert.equal(classes.has("nhp-reveal"), true, "Alt down reveals");
chromeWin.fire("keyup", { key: "Alt" });
assert.equal(classes.has("nhp-reveal"), true, "stays revealed after release while the popup is open");
popups.delete("preview-popup");
fakeWindow.moCallback();
assert.equal(classes.has("nhp-reveal"), false, "reveal clears once Zotero closes the popup");
popups.add("preview-popup");
fakeWindow.moCallback();
assert.equal(classes.has("nhp-reveal"), false, "next hover stays hidden");
chromeWin.fire("keydown", { key: "Shift" });
assert.equal(classes.has("nhp-reveal"), false, "other keys ignored");
chromeWin.fire("mousemove", { altKey: true });
assert.equal(classes.has("nhp-reveal"), true, "mousemove with altKey syncs held state");
chromeWin.fire("blur", {});
chromeWin.fire("mousemove", { altKey: false });
popups.delete("preview-popup");
fakeWindow.moCallback();
assert.equal(classes.has("nhp-reveal"), false, "blur / mousemove resets held state");

// --- master switch off ---
prefs[P + "enabled"] = false;
fn("onPrefChange")();
assert.equal(styleEl.textContent, "", "master off: no hiding CSS");
prefs[P + "override.key"] = "none";
ir._updateState({ primaryViewOverlayPopup: { type: "internal-link" } });
assert.equal(ir.state.primaryViewOverlayPopup.type, "internal-link", "master off lets everything through");

// --- shutdown ---
fn("shutdown")();
assert.equal(Object.hasOwn(ir, "_updateState"), false, "shutdown restores prototype method");
assert.equal(styleEl, null, "shutdown removes stylesheet");
assert.equal((chromeWin.listeners.keydown || []).length, 0, "shutdown removes key listeners");
console.log("all tests passed");
