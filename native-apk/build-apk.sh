#!/usr/bin/env bash
# Builds YWAM-Beneficiary.apk with the classic Android command-line tools (no Gradle, no Google download).
# Needs (Ubuntu/Debian):  apt install openjdk-17-jdk aapt apksigner zipalign dalvik-exchange libandroid-23-java
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR="${ANDROID_JAR:-/usr/share/java/com.android.android-23.jar}"
KEYSTORE="${KEYSTORE:-../android/app/ywam-debug.keystore}"   # same signing key as the GitHub (Capacitor) build
KS_PASS="${KS_PASS:-ywamdebug}"
OUT="${1:-build/YWAM-Beneficiary.apk}"

rm -rf build && mkdir -p build/gen build/classes build/assets/www
cp ../www/* build/assets/www/                 # the phone web app (copy of ywam-server/public/m)

aapt package -f -m -J build/gen -M AndroidManifest.xml -S res -A build/assets -I "$ANDROID_JAR" \
     -F build/unaligned.apk --min-sdk-version 23 --target-sdk-version 33 \
     --version-code 11 --version-name 1.1.0
javac -source 8 -target 8 -Xlint:-options -bootclasspath "$ANDROID_JAR" -d build/classes \
      $(find build/gen src -name '*.java')
dalvik-exchange --dex --output=build/classes.dex build/classes
(cd build && aapt add unaligned.apk classes.dex >/dev/null)
zipalign -f -p 4 build/unaligned.apk build/aligned.apk
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --ks-key-alias ywam \
          --out "$OUT" build/aligned.apk
apksigner verify --verbose "$OUT"
echo "Built: $OUT"
