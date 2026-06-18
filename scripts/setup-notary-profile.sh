#!/usr/bin/env bash
set -euo pipefail

PROFILE_NAME="${AIUW_NOTARY_PROFILE:-AIUsageNotary}"
APPLE_ID="${AIUW_NOTARY_APPLE_ID:-superzhangkai@vip.qq.com}"
TEAM_ID="${AIUW_NOTARY_TEAM_ID:-5MXZ674CA6}"

echo "Creating notarytool Keychain profile: ${PROFILE_NAME}"
echo "Apple ID: ${APPLE_ID}"
echo "Team ID: ${TEAM_ID}"
echo
echo "Paste the Apple ID app-specific password only into Apple's secure prompt."
echo "Do not paste it into chat, scripts, docs, or shell history."
echo

xcrun notarytool store-credentials "${PROFILE_NAME}" \
  --apple-id "${APPLE_ID}" \
  --team-id "${TEAM_ID}" \
  --validate

echo
echo "Saved. Verify with:"
echo "xcrun notarytool history --keychain-profile ${PROFILE_NAME}"
