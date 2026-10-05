#!/bin/zsh
set -eu
cd "${0:A:h}/.."
mkdir -p assets/icon.iconset
for size in 16 32 128 256 512; do
  magick -background none assets/icon.svg -resize "${size}x${size}" "assets/icon.iconset/icon_${size}x${size}.png"
  doubled=$((size * 2))
  magick -background none assets/icon.svg -resize "${doubled}x${doubled}" "assets/icon.iconset/icon_${size}x${size}@2x.png"
done
iconutil -c icns assets/icon.iconset -o assets/icon.icns
rm -rf assets/icon.iconset
