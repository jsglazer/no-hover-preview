#!/bin/sh
# Packages addon/ into no-hover-preview.xpi (no toolchain needed).
set -e
cd "$(dirname "$0")"
rm -f no-hover-preview.xpi
(cd addon && zip -qr -X ../no-hover-preview.xpi . -x '.*')
echo "built no-hover-preview.xpi"
