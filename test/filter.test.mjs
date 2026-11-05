// Exercises bootstrap.js against a fake reader that mirrors the real one's _updateState flow and popup DOM.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const P = "extensions.zotero.nohoverpreview.";
const prefs = { [P + "enabled"]: true, [P + "block.internalLink"]: true, [P + "block.citation"]: false, [P + "block.reference"]: true, [P + "block.footnote"]: true, [P + "override.key"]: "none" };

const ctx = {
  Zotero: { Prefs: { get: (k) => prefs[k] }, debug: () => {}, Reader: { _readers: [] } },
  // waiveXrays maps a fake "Xray" wrapper ({__waived: obj}) to the underlying object, like Firefox's distinct wrappers for one window
  Components: { utils: { exportFunction: (f) => f, waiveXrays: (o) => (o && o.__waived) || o } },
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

// Fake views: navigate on the prototype (as in the real classes), PDF-style _onOpenLink, DOM-style _options.onOpenLink
const calls = [];
class FakeView {
  constructor(win) { this._iframeWindow = win; this._onOpenLink = (url) => calls.push("pdf-open:" + url); this._options = { onOpenLink: (url) => calls.push("dom-open:" + url) }; }
  navigate(loc) { calls.push("nav:" + loc); }
}
const viewWin = fakeWindow();
viewWin.event = undefined;
// The event's target reaches the plugin through an Xray, so its defaultView is a *different wrapper* of viewWin (the bug in 1.0.2)
const viewDoc = { defaultView: { __waived: viewWin } };
class InternalReader {
  constructor() { this.state = {}; this._primaryView = new FakeView(viewWin); }
  _updateState(s) { this.state = { ...this.state, ...s }; }
  _createView() { return new FakeView(viewWin); }
}
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

// --- navigation block ---
Object.assign(prefs, { [P + "nav.enabled"]: true, [P + "nav.internal"]: true, [P + "nav.external"]: true, [P + "nav.key"]: "shift" });
const view = ir._primaryView;
const click = (extra = {}) => ({ type: "pointerup", target: { ownerDocument: viewDoc }, shiftKey: false, ...extra });
iframeWin.event = click();
view.navigate("p5"); view._onOpenLink("http://a"); view._options.onOpenLink("http://b");
assert.deepEqual(calls, [], "plain click in the page: internal + web navigation blocked");
iframeWin.event = click({ shiftKey: true });
view.navigate("p5"); view._onOpenLink("http://a");
assert.deepEqual(calls, ["nav:p5", "pdf-open:http://a"], "shift-click follows the link");
calls.length = 0;
iframeWin.event = { type: "click", target: { ownerDocument: doc } };
view.navigate("outline");
assert.deepEqual(calls, ["nav:outline"], "clicks in the sidebar (reader doc) still navigate");
calls.length = 0;
iframeWin.event = undefined;
view.navigate("back");
assert.deepEqual(calls, ["nav:back"], "programmatic / keyboard navigation unaffected");
calls.length = 0;
viewWin.event = click(); // event exposed on the view window instead
view.navigate("p6");
assert.deepEqual(calls, [], "detects the click via the view window too");
viewWin.event = undefined;
// signal 2: no window.event at all, only our own capture listener on the page window
iframeWin.event = undefined;
viewWin.fire("pointerdown", {});
viewWin.fire("pointerup", { shiftKey: false });
view.navigate("p6b");
assert.deepEqual(calls, [], "recorded plain click blocks even without window.event");
viewWin.fire("pointerdown", {});
viewWin.fire("pointerup", { shiftKey: true });
view.navigate("p6c");
assert.deepEqual(calls, ["nav:p6c"], "recorded shift-click follows");
calls.length = 0;
viewWin.fire("pointerdown", {});
view.navigate("p6d");
assert.deepEqual(calls, ["nav:p6d"], "pointerdown clears the recorded click");
calls.length = 0;
prefs[P + "nav.external"] = false;
iframeWin.event = click();
view._onOpenLink("http://c"); view.navigate("p7");
assert.deepEqual(calls, ["pdf-open:http://c"], "per-kind toggle: web links allowed, internal still blocked");
calls.length = 0;
prefs[P + "nav.enabled"] = false;
view.navigate("p8");
assert.deepEqual(calls, ["nav:p8"], "block navigation off");
calls.length = 0;
prefs[P + "nav.enabled"] = true;
const split = (ir._secondaryView = ir._createView(false)); // the real reader stores it here
split.navigate("p9");
assert.deepEqual(calls, [], "views created later (split view) are wrapped too");
iframeWin.event = undefined;

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
assert.equal(Object.hasOwn(ir, "_createView"), false, "shutdown restores _createView");
assert.equal(Object.hasOwn(view, "navigate"), false, "shutdown unwraps view.navigate");
assert.equal((viewWin.listeners.pointerup || []).length, 0, "shutdown removes page-window click listeners");
iframeWin.event = click();
view._onOpenLink("http://d");
assert.deepEqual(calls, ["pdf-open:http://d"], "shutdown restores _onOpenLink");
assert.equal(styleEl, null, "shutdown removes stylesheet");
assert.equal((chromeWin.listeners.keydown || []).length, 0, "shutdown removes key listeners");
console.log("all tests passed");
