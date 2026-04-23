#!/usr/bin/env bash
#
# scripts/setup-keystore.sh
#
# توليد keystore جديد لتطبيق "زبوني" وتجهيز credentials.json تلقائياً
# لاستخدامه مع EAS local Android builds.
#
# استخدام:
#   cd artifacts/marsool
#   bash scripts/setup-keystore.sh
#
# يجب تشغيله مرة واحدة فقط. احفظ كلمات المرور في مكان آمن.
# ⚠️  إذا فقدت الـ keystore لن تستطيع تحديث التطبيق على Google Play.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYSTORE_DIR="$APP_DIR/credentials"
KEYSTORE_PATH="$KEYSTORE_DIR/zaboni-release.keystore"
CREDENTIALS_JSON="$APP_DIR/credentials.json"
KEY_ALIAS="zaboni"

mkdir -p "$KEYSTORE_DIR"

if ! command -v keytool >/dev/null 2>&1; then
  echo "❌ keytool not found. Install JDK 17 first:"
  echo "   Linux:   sudo apt install -y openjdk-17-jdk"
  echo "   macOS:   brew install --cask temurin@17"
  echo "   Windows: https://adoptium.net/temurin/releases/?version=17"
  exit 1
fi

if [[ -f "$KEYSTORE_PATH" ]]; then
  echo "⚠️  Keystore already exists at: $KEYSTORE_PATH"
  read -r -p "Overwrite? (type 'YES' to confirm): " CONFIRM
  if [[ "$CONFIRM" != "YES" ]]; then
    echo "Aborted."
    exit 0
  fi
  rm -f "$KEYSTORE_PATH"
fi

echo "==> Setting up Android signing keystore for com.zaboni.delivery"
echo

read -r -s -p "Enter a NEW keystore password (min 6 chars): " STORE_PASS
echo
read -r -s -p "Confirm keystore password: " STORE_PASS_2
echo
if [[ "$STORE_PASS" != "$STORE_PASS_2" ]]; then
  echo "❌ Passwords do not match."
  exit 1
fi
if [[ ${#STORE_PASS} -lt 6 ]]; then
  echo "❌ Password too short (need at least 6 characters)."
  exit 1
fi

read -r -s -p "Enter a NEW key password (press enter to reuse keystore password): " KEY_PASS
echo
if [[ -z "$KEY_PASS" ]]; then
  KEY_PASS="$STORE_PASS"
fi

echo
echo "==> Generating keystore (RSA 2048, valid for ~27 years)..."
keytool -genkeypair -v \
  -keystore "$KEYSTORE_PATH" \
  -alias "$KEY_ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass "$STORE_PASS" \
  -keypass "$KEY_PASS" \
  -dname "CN=Zaboni Delivery, O=Zaboni, L=Homs, C=SY"

echo
echo "==> Writing credentials.json"

# Escape passwords for JSON (handle backslashes and double-quotes)
escape_json() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}
STORE_PASS_ESC="$(escape_json "$STORE_PASS")"
KEY_PASS_ESC="$(escape_json "$KEY_PASS")"

cat > "$CREDENTIALS_JSON" <<EOF
{
  "android": {
    "keystore": {
      "keystorePath": "credentials/zaboni-release.keystore",
      "keystorePassword": "$STORE_PASS_ESC",
      "keyAlias": "$KEY_ALIAS",
      "keyPassword": "$KEY_PASS_ESC"
    }
  }
}
EOF

chmod 600 "$CREDENTIALS_JSON" "$KEYSTORE_PATH"

echo
echo "✅ Done!"
echo "   Keystore:        $KEYSTORE_PATH"
echo "   credentials.json: $CREDENTIALS_JSON"
echo
echo "📋 SHA-1 / SHA-256 fingerprints (add to Firebase if using Google Sign-In):"
keytool -list -v -keystore "$KEYSTORE_PATH" -alias "$KEY_ALIAS" -storepass "$STORE_PASS" \
  | grep -E "SHA(1|256):" || true
echo
echo "🚀 Ready to build:"
echo "   cd artifacts/marsool"
echo "   eas build --platform android --profile production-apk --local   # APK"
echo "   eas build --platform android --profile production --local       # AAB"
echo
echo "⚠️  BACK UP THE KEYSTORE FILE AND PASSWORDS NOW."
echo "    Both files are gitignored — store copies in a secure password manager."
