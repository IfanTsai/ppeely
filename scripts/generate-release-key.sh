#!/usr/bin/env bash
# Creates the Android release signing key: native/android/keystore/ppeely-release.jks and
# native/android/keystore.properties (both git-ignored). The password is generated randomly and written
# straight to keystore.properties; it is never printed. Back up both files: an app published on a store can
# only be updated with the same key.
# Requires keytool (part of JDK 21; set JAVA_HOME or put keytool on PATH) and openssl.
set -euo pipefail

cd "$(dirname "$0")/../native/android"

keytool="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"

if [[ -e keystore.properties || -e keystore/ppeely-release.jks ]]; then
  echo "A release key already exists; move keystore.properties and keystore/ppeely-release.jks away first." >&2
  exit 1
fi

umask 077
mkdir -p keystore

PPEELY_KEY_PASSWORD="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-32)"
export PPEELY_KEY_PASSWORD

# PKCS12 key stores use the store password for the key as well.
"$keytool" -genkeypair -keystore keystore/ppeely-release.jks -storetype PKCS12 \
  -storepass:env PPEELY_KEY_PASSWORD -keypass:env PPEELY_KEY_PASSWORD \
  -alias ppeely -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10000 \
  -dname "CN=Ppeely, O=Ppeely"

printf 'storeFile=keystore/ppeely-release.jks\nstorePassword=%s\nkeyAlias=ppeely\nkeyPassword=%s\n' \
  "$PPEELY_KEY_PASSWORD" "$PPEELY_KEY_PASSWORD" > keystore.properties

"$keytool" -list -v -keystore keystore/ppeely-release.jks -storepass:env PPEELY_KEY_PASSWORD | grep -E 'Owner|Valid from|SHA256:'
unset PPEELY_KEY_PASSWORD
