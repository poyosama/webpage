#!/usr/bin/env bash
# Compila El tablero TV (APK) sin Gradle: aapt2 + javac + d8 + zipalign + apksigner.
# Uso: ANDROID_SDK=/ruta/al/sdk KEYSTORE=/ruta/eltablero-tv.jks KS_PASS=... ./android-tv/build.sh
# Sale en public/tv.apk (se descarga desde eltablero.blog/tv.apk).
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_SDK:?falta ANDROID_SDK}" "${KEYSTORE:?falta KEYSTORE}" "${KS_PASS:?falta KS_PASS}"
BT="$ANDROID_SDK/build-tools/35.0.0"
JAR="$ANDROID_SDK/platforms/android-35/android.jar"
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest AndroidManifest.xml -o "$OUT/base.apk" --java "$OUT/gen" "$OUT/res.zip" --auto-add-overlay
javac -nowarn --release 11 -classpath "$JAR" -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java') 2>&1 | grep -v JAVA_TOOL_OPTIONS || true
"$BT/d8" --release --min-api 23 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -j ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --out ../public/tv.apk "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs ../public/tv.apk | head -3
rm -rf "$OUT" ../public/tv.apk.idsig
ls -la ../public/tv.apk
