export function postInstallScreenshotGateBlocked({
  localOnly,
  installEvidenceReady,
  screenshotProofMissingOrInvalidCount,
}) {
  return !localOnly && installEvidenceReady && screenshotProofMissingOrInvalidCount > 0;
}

export function screenshotProofIssueStatus({
  localOnly,
  installEvidenceReady,
}) {
  return postInstallScreenshotGateBlocked({
    localOnly,
    installEvidenceReady,
    screenshotProofMissingOrInvalidCount: 1,
  })
    ? "FAIL"
    : "WARN";
}
