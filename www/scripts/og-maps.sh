#!/bin/bash
# Capture the OG-card map images (`scrns.config.ts` `og-maps/*`) from a running
# dev server, then convert them to JPEG (`public/og-maps/<width>/<dir>-<time>.jpg`).
# Headful Chrome (WebGL); macOS `sips`. Re-run when the map or its data changes.
set -e
cd "$(dirname "$0")/.."
PORT="${1:-3847}"
scrns -h "$PORT" -o public -i 'og-maps/'
for f in public/og-maps/*/*.png; do
  sips -s format jpeg -s formatOptions 85 "$f" --out "${f%.png}.jpg" >/dev/null
  rm "$f"
done
ls -l public/og-maps/*/
