#!/usr/bin/env bash
# Builds zaboni-line.apk with the plain Android SDK tools — no Gradle needed.
#   ANDROID_HOME   Android SDK (default ~/Library/Android/sdk)
#   KEYSTORE       signing keystore (created on first build if missing; keep it,
#                  updates must be signed with the same key)
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
PLATFORM="$SDK/platforms/$(ls "$SDK/platforms" | sort -V | tail -1)/android.jar"
KEYSTORE="${KEYSTORE:-$HOME/.zaboni-line.keystore}"
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT/classes" "$OUT/dex"

"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" --manifest AndroidManifest.xml
javac --release 11 -encoding UTF-8 -Xlint:-options -classpath "$PLATFORM" -d "$OUT/classes" $(find src -name '*.java')
"$BT/d8" --min-api 23 --lib "$PLATFORM" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias line -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass zaboniline -keypass zaboniline -dname "CN=Zaboni Line" >/dev/null
  echo "created signing key $KEYSTORE (back it up)"
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:zaboniline --ks-key-alias line --out zaboni-line.apk "$OUT/aligned.apk"
echo "built $(pwd)/zaboni-line.apk"
