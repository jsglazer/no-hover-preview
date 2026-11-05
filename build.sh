#!/bin/sh
# Packages addon/ into no-hover-preview.xpi and writes build/update.json (the auto-update manifest served from the `release` GitHub release).
set -e
cd "$(dirname "$0")"
rm -f no-hover-preview.xpi
(cd addon && zip -qr -X ../no-hover-preview.xpi . -x '.*')
mkdir -p build
python3 - <<'PY'
import hashlib, json
m = json.load(open("addon/manifest.json"))
z = m["applications"]["zotero"]
v = m["version"]
h = "sha512:" + hashlib.sha512(open("no-hover-preview.xpi", "rb").read()).hexdigest()
update = {"version": v, "update_link": f"https://github.com/jsglazer/no-hover-preview/releases/download/{v}/no-hover-preview.xpi", "update_hash": h, "applications": {"zotero": {"strict_min_version": z["strict_min_version"], "strict_max_version": z["strict_max_version"]}}}
json.dump({"addons": {z["id"]: {"updates": [update]}}}, open("build/update.json", "w"), indent=2)
print("built no-hover-preview.xpi and build/update.json for", v)
PY
