#!/usr/bin/env bash
# Renders scripts/icon-src.svg to the PNG sizes iOS and the manifest need.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/icons
cp scripts/icon-src.svg public/icons/icon.svg
for size in 192 512; do
  rsvg-convert -w "$size" -h "$size" scripts/icon-src.svg -o "public/icons/icon-${size}.png"
done
rsvg-convert -w 180 -h 180 scripts/icon-src.svg -o public/icons/apple-touch-icon.png
echo "icons written to public/icons/"
