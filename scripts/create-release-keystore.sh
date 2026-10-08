#!/usr/bin/env bash
# Creates the Play Store upload keystore OUTSIDE the repo and prints the keystore.properties to use.
# You choose the passwords (keytool prompts). BACK THE FILE UP: losing the upload key means a support
# ticket with Google to reset it. Never commit it.
set -euo pipefail
DIR="${HIVA_KEYSTORE_DIR:-$HOME/.hiva-keystore}"
FILE="$DIR/hiva-release.jks"
ALIAS="hiva-upload"
mkdir -p "$DIR"
chmod 700 "$DIR"
if [ -e "$FILE" ]; then echo "Refusing to overwrite $FILE"; exit 1; fi
keytool -genkeypair -v -storetype JKS -keystore "$FILE" -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10000
chmod 600 "$FILE"
echo
echo "Created $FILE. Now create android/keystore.properties with:"
echo "  storeFile=$FILE"
echo "  storePassword=<the store password you typed>"
echo "  keyAlias=$ALIAS"
echo "  keyPassword=<the key password you typed>"
