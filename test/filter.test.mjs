// Exercises bootstrap.js patch logic against a fake reader that mirrors the real one's _updateState flow.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const prefs = {};
const ctx = {
  Zotero: { Prefs: { get: (k) => prefs[k] }, debug: () => {} },
  Components: { utils: { exportFunction: (f) => f } },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../addon/bootstrap.js", import.meta.url), "utf8"), ctx);

class InternalReader { constructor() { this.state = {}; } _updateState(s) { this.state = { ...this.state, ...s }; } }
const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} }, documentElement: {} };
const reader = { _internalReader: new InternalReader(), _iframeWindow: { document: doc }, _instanceID: "t" };
vm.runInContext("patchReader", ctx)(reader);
const ir = reader._internalReader;
const P = "extensions.zotero.nohoverpreview.";
Object.assign(prefs, { [P + "enabled"]: true, [P + "block.internalLink"]: true, [P + "block.citation"]: false, [P + "block.reference"]: true, [P + "block.footnote"]: true });

ir._updateState({ primaryViewOverlayPopup: { type: "internal-link" } });
assert.equal(ir.state.primaryViewOverlayPopup, null, "internal-link blocked");
ir._updateState({ secondaryViewOverlayPopup: { type: "reference" } });
assert.equal(ir.state.secondaryViewOverlayPopup, null, "reference blocked in split view");
ir._updateState({ primaryViewOverlayPopup: { type: "citation" } });
assert.equal(ir.state.primaryViewOverlayPopup.type, "citation", "citation allowed when its pref is off");
ir._updateState({ primaryViewOverlayPopup: { type: "external-link" } });
assert.equal(ir.state.primaryViewOverlayPopup.type, "external-link", "unlisted types untouched");
prefs[P + "enabled"] = false;
ir._updateState({ primaryViewOverlayPopup: { type: "internal-link" } });
assert.equal(ir.state.primaryViewOverlayPopup.type, "internal-link", "master switch off lets everything through");
ir._updateState({ annotations: [1] });
assert.deepEqual(ir.state.annotations, [1], "other state passes through");
vm.runInContext("unpatchReader", ctx)(reader);
assert.equal(Object.hasOwn(ir, "_updateState"), false, "shutdown restores prototype method");
console.log("all filter tests passed");
