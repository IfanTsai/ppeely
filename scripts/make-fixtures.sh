#!/usr/bin/env bash
# Creates the media files the end-to-end tests read from FIXTURES. They are not in the repository:
# the photo and the font are downloaded from pinned URLs and checked against SHA-256, the rest is generated.
#   cat.jpg          photo of a kitten with a clear subject for smart select (CC0, Wikimedia Commons)
#   cat.gif          400×400 animated GIF, 24 frames, 2 s
#   clip.mp4         480×360 H.264 video, 2 s
#   small-anim.webp  300×200 animated WebP, deliberately not 512×512 so the app has to re-encode it
#   font.ttf         TrueType font for the custom font tests (Anton, SIL Open Font License 1.1)
# Usage: ./scripts/make-fixtures.sh <fixtures directory>
# Requires curl, sha256sum and an ffmpeg build with libx264 and libwebp.
set -euo pipefail

dir="${1:?usage: $0 <fixtures directory>}"
mkdir -p "$dir"
cd "$dir"

download() {
  local url="$1" sha256="$2" output="$3"

  curl -fsSL --retry 3 -A 'ppeely-fixtures' -o "$output.part" "$url"
  echo "$sha256  $output.part" | sha256sum --check --quiet -
  mv "$output.part" "$output"
}

ffmpeg_quiet() {
  ffmpeg -hide_banner -loglevel error -y "$@"
}

# "A focused kitten" by Ty Swartz, CC0: https://commons.wikimedia.org/wiki/File:A_focused_kitten_(Pixabay).jpg
# It also appears in the README screenshots.
download 'https://upload.wikimedia.org/wikipedia/commons/0/09/A_focused_kitten_%28Pixabay%29.jpg' \
  742c6037b21e24ff309ebd3c8564b3c8b87dcd8ffc7076a777b8f9d4757a655f cat-original.jpg
ffmpeg_quiet -i cat-original.jpg -vf scale=960:-2 -q:v 3 cat.jpg
rm cat-original.jpg

# The photo pans across a square crop (GIF) and a 4:3 crop (video), along whichever side of the photo is longer.
# The duration is an input option: palettegen only emits the palette once its input ends, and a looped image never ends on its own.
square="min(iw,ih)"
ffmpeg_quiet -loop 1 -t 2 -i cat.jpg \
  -filter_complex "fps=12,crop='$square':'$square':'(iw-$square)*t/2':'(ih-$square)*t/2',scale=400:400,split[a][b];[a]palettegen[p];[b][p]paletteuse" \
  cat.gif

wide="min(iw,ih*4/3)"
ffmpeg_quiet -loop 1 -t 2 -i cat.jpg \
  -vf "fps=15,crop='$wide':'$wide*3/4':'(iw-$wide)*t/2':'(ih-$wide*3/4)*t/2',scale=480:360,format=yuv420p" \
  -c:v libx264 -movflags +faststart clip.mp4

ffmpeg_quiet -f lavfi -i 'testsrc2=size=300x200:rate=5:duration=1' \
  -c:v libwebp_anim -loop 0 -quality 50 small-anim.webp

# Pinned to a google/fonts commit so the checksum stays valid.
download 'https://raw.githubusercontent.com/google/fonts/e0a8124cf36bb7c32ca68e5d46d6acdbc3df866a/ofl/anton/Anton-Regular.ttf' \
  a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab font.ttf

ls -l cat.jpg cat.gif clip.mp4 small-anim.webp font.ttf
