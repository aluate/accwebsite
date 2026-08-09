#!/bin/bash
#
# build-swatches.sh — derive the served melamine swatches from full-resolution sources.
#
# The supplier photography runs to 7200x7200 and 5.4MB per file; the full set is
# 225MB. What the app needs is a 400px square: big enough for a picker thumbnail and
# for a swatch printed on a spec sheet at half an inch (400px over 0.5in is 800dpi,
# well past what any printer resolves).
#
# Serving the originals would move hundreds of megabytes per page view of the colour
# picker, metered by Vercel as Fast Data Transfer. That is the same shape of problem
# as the log drain that produced a $1,000 bill in July: not a bug, just a volume
# nobody had costed.
#
# Result: 225MB -> 6.0MB, largest single file 65KB, woodgrain still legible.
#
# Everything is written as .jpg. 67 of the sources are PNG photographs, which is the
# worst available container for a photograph — one was 5.3MB and became 16KB.
#
# Usage:
#   scripts/build-swatches.sh [SRC_DIR] [OUT_DIR]
#
# Defaults to _originals/melamines-fullres -> public/melamines.
# Requires ImageMagick. Safe to re-run: existing outputs are skipped unless --force.

set -u

SRC="${1:-_originals/melamines-fullres}"
OUT="${2:-public/melamines}"
FORCE="${FORCE:-}"
[[ "${3:-}" == "--force" ]] && FORCE=1

if ! command -v convert >/dev/null 2>&1; then
  echo "ERROR: ImageMagick 'convert' not found." >&2
  echo "  Debian/Ubuntu:  sudo apt-get install imagemagick" >&2
  exit 1
fi

if [ ! -d "$SRC" ]; then
  echo "ERROR: source directory '$SRC' not found." >&2
  echo "  The full-resolution originals are gitignored — they live on the machine" >&2
  echo "  that downloaded them. This script only needs running when they change." >&2
  exit 1
fi

mkdir -p "$OUT"

n=0; made=0; skipped=0; failed=0
# `ls` rather than a glob: the sources often sit on a network mount where expanding
# a 366-entry glob is far slower than listing it.
for f in $(ls "$SRC"); do
  stem="${f%.*}"
  dest="$OUT/$stem.jpg"
  n=$((n + 1))
  if [ -f "$dest" ] && [ -z "$FORCE" ]; then skipped=$((skipped + 1)); continue; fi
  if convert "$SRC/$f" \
       -auto-orient \
       -resize 400x400^ -gravity center -extent 400x400 \
       -strip -interlace Plane -quality 82 \
       "$dest" 2>/dev/null; then
    made=$((made + 1))
  else
    failed=$((failed + 1)); echo "  FAILED: $f" >&2
  fi
done

echo "$n source(s): $made written, $skipped already present, $failed failed"
echo "$OUT is now $(du -sh "$OUT" 2>/dev/null | cut -f1)"
[ "$failed" -gt 0 ] && exit 1
exit 0
