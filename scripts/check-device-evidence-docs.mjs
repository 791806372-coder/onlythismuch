import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const evidenceDir = path.join(repoRoot, "outputs", "device-evidence");
const manifestPath = path.join(evidenceDir, "manifest.json");
const readmePath = path.join(evidenceDir, "README.md");
const rootReadmePath = path.join(repoRoot, "README.md");
const iosReadmePath = path.join(repoRoot, "ios", "README.md");
const statusPath = path.join(repoRoot, "outputs", "AI-Usage-Widget-Implementation-Status.md");
const readinessPath = path.join(evidenceDir, "00-device-readiness.json");
const evidenceSummaryPath = path.join(evidenceDir, "00-evidence-summary.json");
const localEvidenceSummaryPath = path.join(evidenceDir, "00-local-evidence-summary.json");
const screenshotProofsPath = path.join(evidenceDir, "screenshot-proofs.json");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const deviceNextSource = fs.readFileSync(path.join(repoRoot, "scripts/device-next.mjs"), "utf8");
const deviceEvidenceSource = fs.readFileSync(path.join(repoRoot, "scripts/device-evidence.mjs"), "utf8");
const deviceEvidencePolicySource = fs.readFileSync(path.join(repoRoot, "scripts/lib/device-evidence-policy.mjs"), "utf8");
const deviceRunbookSource = fs.readFileSync(path.join(repoRoot, "scripts/device-runbook.mjs"), "utf8");
const deviceInstallSource = fs.readFileSync(path.join(repoRoot, "scripts/device-install.mjs"), "utf8");
const smokeLocalPairingSource = fs.readFileSync(path.join(repoRoot, "scripts/smoke-local-pairing.mjs"), "utf8");
const smokeConnectorSource = fs.readFileSync(path.join(repoRoot, "scripts/smoke-connector.mjs"), "utf8");
const smokeLocalApprovalSource = fs.readFileSync(path.join(repoRoot, "scripts/smoke-local-approval.mjs"), "utf8");
const signingDiagnoseSource = fs.readFileSync(path.join(repoRoot, "scripts/signing-diagnose.mjs"), "utf8");
const devicePreflightSource = fs.readFileSync(path.join(repoRoot, "scripts/device-preflight.mjs"), "utf8");
const connectorCliSource = fs.readFileSync(path.join(repoRoot, "connector/src/cli.ts"), "utf8");
const iosBuildFreshnessSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/ios-build-freshness.mjs"), "utf8");
const iosTestBuildSource = fs.readFileSync(path.join(repoRoot, "scripts/build-ios-tests.mjs"), "utf8");
const appIntentFreshSource = fs.readFileSync(path.join(repoRoot, "scripts/check-appintent-metadata-fresh.mjs"), "utf8");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const readme = fs.readFileSync(readmePath, "utf8");
const rootReadme = fs.readFileSync(rootReadmePath, "utf8");
const iosReadme = fs.readFileSync(iosReadmePath, "utf8");
const statusDoc = fs.readFileSync(statusPath, "utf8");
const screenshots = manifest.requiredScreenshots;

if (manifest.schemaVersion !== 1 || !Array.isArray(screenshots) || screenshots.length === 0) {
  fail("manifest.json must use schemaVersion 1 and a non-empty requiredScreenshots array");
}

const manifestFiles = screenshots.map((item) => item.filename);
const readmeFiles = [...readme.matchAll(/\| `([0-9]{2}-[a-z0-9-]+\.png)` \|/g)].map((match) => match[1]);

assertSameList(manifestFiles, readmeFiles, "README screenshot table must match manifest filenames");
assertIncludes(readme, "`manifest.json` is the source of truth", "README must point readers to manifest.json as source of truth");
assertIncludes(readme, "`00-device-readiness.json`", "README must document the pre-install readiness artifact");
assertIncludes(readme, "`00-evidence-summary.json`", "README must document the post-run evidence summary artifact");
assertIncludes(readme, "`00-local-evidence-summary.json`", "README must document the local-only evidence summary artifact");
assertIncludes(readme, "`screenshot-proofs.json`", "README must document the screenshot proof sidecar");
assertIncludes(readme, "run `npm run device:evidence` once", "device evidence README must explain first-run sidecar generation");
assertIncludes(readme, "then run it again", "device evidence README must explain second-run sidecar validation");
assertIncludes(rootReadme, "`outputs/device-evidence/screenshot-proofs.json`", "root README must document the screenshot proof sidecar");
assertIncludes(rootReadme, "run it once to write the updated sidecar and run it again", "root README must explain first-run/second-run screenshot proof validation");
assertIncludes(rootReadme, "After install proof exists, strict `npm run device:evidence` exits nonzero until all required screenshots are present and sidecar-bound", "root README must document strict screenshot blocking after install proof");
assertIncludes(rootReadme, "npm run connector:service:status", "root README phone loop must check LaunchAgent status before starting mock");
assertIncludes(rootReadme, "npm run connector:service:unload", "root README phone loop must document unloading the service before mock proof");
assertIncludes(rootReadme, "all three use port `8787`", "root README phone loop must explain mock/real/service port conflict");
assertIncludes(iosReadme, "`outputs/device-evidence/screenshot-proofs.json`", "iOS README must document the screenshot proof sidecar");
assertIncludes(iosReadme, "run `npm run device:evidence` once", "iOS README must explain first-run screenshot proof generation");
assertIncludes(iosReadme, "then run it again", "iOS README must explain second-run screenshot proof validation");
assertIncludes(iosReadme, "After install proof exists, strict `npm run device:evidence` exits nonzero until all required screenshots are present and sidecar-bound", "iOS README must document strict screenshot blocking after install proof");
assertIncludes(iosReadme, "npm run connector:service:status", "iOS README must check LaunchAgent status before starting mock");
assertIncludes(iosReadme, "npm run connector:service:unload", "iOS README must document unloading the service before mock proof");
assertIncludes(iosReadme, "all three connector modes use port `8787`", "iOS README must explain mock/real/service port conflict");
assertIncludes(readme, "npm run connector:approvals:seed", "README approval proof must start from the root Mac-owned pending request script");
assertIncludes(readme, "npm run connector:approvals", "README approval decision proof must use the root approvals status script");
assertIncludes(readme, "npm run connector:approvals:clear", "README approval proof must document the reset script");
assertIncludes(readme, "从 Mac 拉请求", "README approval proof must include iPhone fetch from the Mac");
assertPackageScript("connector:approvals:seed", "approvals seed");
assertPackageScript("connector:approvals", "approvals");
assertPackageScript("connector:approvals:clear", "approvals clear");
assertPackageScript("connector:service:install:codexbar", "service install --codexbar");
assertPackageScript("device:evidence", "npm --prefix connector run build");
assertPackageScript("device:evidence", "node scripts/device-evidence.mjs");
assertPackageScript("device:evidence:local", "npm --prefix connector run build");
assertPackageScript("device:evidence:local", "node scripts/device-evidence.mjs --local-only");
assertPackageScript("device:build:unsigned", "generic/platform=iOS");
assertPackageScript("device:build:unsigned", "-destination-timeout 30");
assertPackageScript("check:ios-tests:fresh", "node scripts/check-ios-test-build-fresh.mjs");
assertPackageScript("check", "device:evidence:local");
assertPackageScript("device:runbook", "node scripts/device-runbook.mjs");
assertIncludes(rootReadme, "`npm run check:ios-tests:fresh`", "root README must document the native XCTest freshness guard");
assertIncludes(iosReadme, "npm run check:ios-tests:fresh", "iOS README must document the native XCTest freshness guard");
assertIncludes(rootReadme, "AIUsageWidgetTests_iphoneos*.xctestrun", "root README must document the native XCTest xctestrun freshness proof");
assertIncludes(iosReadme, "AIUsageWidgetTests_iphoneos*.xctestrun", "iOS README must document the native XCTest xctestrun freshness proof");
assertIncludes(rootReadme, "`npm run device:runbook`", "root README must document the phone proof runbook command");
assertIncludes(iosReadme, "`npm run device:runbook`", "iOS README must document the phone proof runbook command");
assertIncludes(rootReadme, "advertised address count", "root README must describe routine status output as address-count based");
assertIncludes(rootReadme, "does not print raw LAN hosts, config paths, Mac device ids/names, tokens, or redacted pairing payloads", "root README must document routine status privacy");
assertIncludes(rootReadme, "Failed fallback attempts are summarized by count only", "root README must describe local pairing fallback output without raw hosts");
assertNotIncludes(rootReadme, "It shows the current device id, port, QR host candidates, a redacted pairing payload", "root README must not describe old raw/redacted pairing status output");
assertNotIncludes(rootReadme, "Failed fallback hosts are reported", "root README must not imply raw fallback host reporting");
assertNotIncludes(rootReadme, "mock QR host snapshot", "root README must describe QR preflight as address/count based");
assertNotIncludes(rootReadme, "advertised QR hosts", "root README must not imply raw QR host output");
assertIncludes(iosReadme, "QR address candidate validation", "iOS README must describe preflight as address validation");
assertIncludes(iosReadme, "advertised QR addresses", "iOS README must describe QR fallback without raw host output");
assertIncludes(iosReadme, "advertised local addresses and reports address counts plus sanitized error buckets", "iOS README must describe live connector status as address-count based");
assertNotIncludes(iosReadme, "pairing host candidates", "iOS README must not preserve old host-candidate wording");
assertNotIncludes(iosReadme, "advertised QR hosts", "iOS README must not imply raw QR host output");
assertNotIncludes(iosReadme, "advertised local hosts", "iOS README must not imply live status prints raw hosts");
assertIncludes(statusDoc, "npm run connector:approvals:seed", "status doc approval proof must use the root seed script");
assertIncludes(statusDoc, "npm run connector:approvals", "status doc approval proof must use the root approvals script");
assertIncludes(statusDoc, "npm run connector:approvals:clear", "status doc approval reset must use the root clear script");
assertNotIncludes(statusDoc, "node connector/dist/connector/src/cli.js approvals", "status doc must not ask users to run internal approval node paths");
assertIncludes(statusDoc, "read-only `aiuw status` pairing/config summary", "status doc must describe routine status as a privacy-safe summary");
assertIncludes(statusDoc, "routine status does not print raw LAN hosts, config paths, Mac device ids/names, tokens, or redacted pairing payloads", "status doc must document routine status privacy");
assertIncludes(statusDoc, "failed fallback attempts are summarized by count without raw host values", "status doc must describe local pairing fallback output without raw hosts");
assertIncludes(statusDoc, "existing pairing config and installed LaunchAgent", "status doc doctor/service state must reflect current LaunchAgent state without contradiction");
assertNotIncludes(statusDoc, "read-only `aiuw status` pairing/config output with port, QR host candidates, redacted pairing payload", "status doc must not preserve old raw/redacted pairing status wording");
assertNotIncludes(statusDoc, "failed fallback hosts are reported", "status doc must not imply raw fallback host reporting");
assertNotIncludes(statusDoc, "link-local `169.254.x.x` host candidate", "status doc must not include raw link-local host examples in preflight notes");
assertNotIncludes(statusDoc, "advertised local hosts", "status doc must not imply local pairing output includes raw host values");
assertIncludes(deviceNextSource, "00-device-readiness.json", "device:next must write the pre-install readiness artifact");
assertIncludes(deviceNextSource, "writeReadinessEvidence", "device:next must use a single readiness writer");
assertIncludes(deviceEvidenceSource, "00-evidence-summary.json", "device:evidence must write the post-run evidence summary artifact");
assertIncludes(deviceEvidenceSource, "00-local-evidence-summary.json", "device:evidence local-only mode must write a separate local summary artifact");
assertIncludes(deviceEvidenceSource, "localOnly", "device:evidence must support the explicit local-only audit mode");
assertIncludes(deviceEvidenceSource, "LOCAL EVIDENCE ONLY", "local-only evidence output must be visually distinct from strict post-install evidence");
assertIncludes(deviceEvidenceSource, "strict device:evidence remains the real post-install gate", "local-only evidence mode must not pretend to be install proof");
assertIncludes(deviceEvidenceSource, "strict proof binding skipped in local-only mode", "local-only evidence mode must not own screenshot proof binding");
assertIncludes(deviceEvidenceSource, "writeEvidenceSummary", "device:evidence must use a single evidence summary writer");
assertIncludes(deviceEvidenceSource, "loadSnapshotParser()(snapshot)", "device:evidence live connector proof must validate the full snapshot contract");
assertIncludes(deviceEvidenceSource, "connector/dist/src/contract/schema.js", "device:evidence should use the built connector contract parser for live snapshot validation");
assertIncludes(deviceEvidenceSource, "printApprovalQaCommands", "device:evidence should print the Mac-owned approval loop when approval screenshots are missing");
assertIncludes(deviceEvidenceSource, "screenshot-proofs.json", "device:evidence must know the centralized screenshot proof sidecar");
assertIncludes(deviceEvidenceSource, "writeScreenshotProofs", "device:evidence must write the centralized screenshot proof sidecar");
assertIncludes(deviceEvidenceSource, "validateScreenshotProofEntry", "device:evidence must validate screenshot fingerprints against the sidecar");
assertIncludes(deviceEvidenceSource, "checkPostInstallScreenshotGate", "device:evidence must enforce screenshots after install proof exists");
assertIncludes(deviceEvidenceSource, "present (${configResult.dirMode}/${configResult.fileMode})", "device:evidence must not print the raw connector config path");
assertIncludes(deviceEvidenceSource, "pairing config unreadable", "device:evidence must bound connector config read errors");
assertIncludes(deviceEvidenceSource, "answered ping+snapshot", "device:evidence live connector proof must summarize host reachability without raw hosts");
assertIncludes(deviceEvidenceSource, "stripLocalPaths", "device:evidence must sanitize absolute local paths in command failure details");
assertNotIncludes(deviceEvidenceSource, "reachable.join(\", \")", "device:evidence must not print raw reachable LAN hosts");
assertNotIncludes(deviceEvidenceSource, "failed.join(\", \")", "device:evidence must not print raw failed LAN hosts");
assertIncludes(deviceEvidenceSource, "postInstallScreenshotGateBlocked", "device:evidence screenshot gate must use the executable evidence policy helper");
assertIncludes(deviceEvidenceSource, "recordScreenshotProofIssue", "device:evidence per-screenshot proof issues must share the executable evidence policy helper");
assertIncludes(deviceEvidenceSource, "screenshotProofIssueStatus", "device:evidence must not hard-code per-screenshot proof failure severity");
assertIncludes(deviceEvidencePolicySource, "!localOnly", "device evidence screenshot policy must not block local-only evidence");
assertIncludes(deviceEvidencePolicySource, "installEvidenceReady", "device evidence screenshot policy must require install proof first");
assertIncludes(deviceEvidencePolicySource, "screenshotProofMissingOrInvalidCount > 0", "device evidence screenshot policy must require missing screenshot proof before blocking");
assertIncludes(deviceEvidencePolicySource, "\"FAIL\"", "device evidence screenshot policy must support post-install failure severity");
assertIncludes(deviceEvidencePolicySource, "\"WARN\"", "device evidence screenshot policy must support pre-install/local warning severity");
assertIncludes(deviceEvidenceSource, "Post-install screenshot proof", "device:evidence must report a clear post-install screenshot proof failure");
assertIncludes(deviceNextSource, "unsignedIphoneosBuildFresh", "device:next readiness must record unsigned iPhone build freshness");
assertIncludes(deviceNextSource, "iphoneosBuildFreshness(repoRoot)", "device:next must use the shared iPhone build freshness helper");
assertIncludes(deviceEvidenceSource, "buildFreshness(repoRoot, configurationDir)", "device:evidence must use the shared build freshness helper");
assertIncludes(iosBuildFreshnessSource, "iosTestBuildFreshness", "iOS build freshness helper must expose native XCTest build freshness");
assertIncludes(deviceEvidenceSource, "iosTestBuildFreshness(repoRoot)", "device:evidence must check native XCTest build freshness");
assertIncludes(appIntentFreshSource, "generic/platform=iOS", "AppIntent freshness rebuild must use a generic iOS destination");
assertIncludes(appIntentFreshSource, "\"-destination-timeout\"", "AppIntent freshness rebuild must bound destination lookup");
assertIncludes(packageJson.scripts["check:scripts"], "node --check scripts/check-ios-test-build-fresh.mjs", "check:scripts must syntax-check the native XCTest freshness guard");
assertIncludes(packageJson.scripts["check:scripts"], "node scripts/check-ios-test-build-fresh.mjs", "check:scripts must run the native XCTest freshness guard");
assertIncludes(iosBuildFreshnessSource, "is newer than", "iOS build freshness helper must compare input and output mtimes");
assertIncludes(deviceRunbookSource, "outputs\", \"device-evidence\", \"manifest.json", "device runbook must read the device screenshot manifest");
assertIncludes(deviceRunbookSource, "npm run device:evidence:local", "device runbook must include local evidence while signing is blocked");
assertIncludes(deviceRunbookSource, "npm run connector:service:status", "device runbook must check optional LaunchAgent status before starting a connector");
assertIncludes(deviceRunbookSource, "service already owns port 8787", "device runbook must explain the LaunchAgent/mock port conflict");
assertIncludes(deviceRunbookSource, "npm run connector:service:unload", "device runbook must document unloading the LaunchAgent before mock proof");
assertIncludes(deviceRunbookSource, "npm run connector:service:load", "device runbook must document reloading the LaunchAgent after mock proof");
assertIncludes(deviceRunbookSource, "npm run start:mock", "device runbook must start the mock connector before QR pairing");
assertIncludes(deviceRunbookSource, "npm run start:real", "device runbook must mention the real connector path after mock proof");
assertIncludes(deviceRunbookSource, "stop npm run start:mock before starting npm run start:real or reloading the LaunchAgent", "device runbook must prevent running mock, real, and service connectors on the same port");
assertIncludes(deviceRunbookSource, "all three use port 8787", "device runbook must explain why mock should be stopped before real connector proof or service reload");
assertIncludes(deviceRunbookSource, "npm run connector:status:live", "device runbook must require live connector status before QR pairing");
assertIncludes(deviceRunbookSource, "Local Network permission proof", "device runbook must remind testers that Mac-local reachability is not iPhone Local Network proof");
assertIncludes(deviceRunbookSource, "npm run connector:approvals:seed", "device runbook must keep the Mac-owned approval seed command");
assertIncludes(deviceRunbookSource, "npm run connector:approvals:clear", "device runbook must document approval reset");
assertIncludes(deviceEvidenceSource, "11-approval-app-diagnostic.png", "device:evidence approval loop must mention app diagnostic screenshot proof");
assertIncludes(deviceEvidenceSource, "12-approval-widget-diagnostic.png", "device:evidence approval loop must mention widget diagnostic screenshot proof");
assertIncludes(deviceEvidenceSource, "App 上次", "device:evidence approval loop must mention app-origin diagnostic text");
assertIncludes(deviceEvidenceSource, "Widget 上次", "device:evidence approval loop must mention widget-origin diagnostic text");
assertIncludes(deviceNextSource, "11-approval-app-diagnostic.png", "device:next approval loop must mention app diagnostic screenshot proof");
assertIncludes(deviceNextSource, "12-approval-widget-diagnostic.png", "device:next approval loop must mention widget diagnostic screenshot proof");
assertIncludes(deviceNextSource, "App 上次", "device:next approval loop must mention app-origin diagnostic text");
assertIncludes(deviceNextSource, "Widget 上次", "device:next approval loop must mention widget-origin diagnostic text");
assertIncludes(deviceRunbookSource, "screenshot-proofs.json", "device runbook must explain screenshot proof sidecar binding");
assertIncludes(deviceNextSource, "screenshot-proofs.json", "device:next must know the centralized screenshot proof sidecar");
assertIncludes(deviceNextSource, "readScreenshotProofs", "device:next must read the screenshot proof sidecar");
assertIncludes(deviceNextSource, "validateScreenshotProof", "device:next must validate screenshot fingerprints against the sidecar");
assertIncludes(deviceNextSource, "pairing config is missing", "device:next must not print the raw connector config path when pairing is missing");
assertIncludes(deviceNextSource, "pairing config is unreadable", "device:next must not print raw connector config read errors");
assertIncludes(deviceNextSource, "pairing config permissions are too broad", "device:next must reject unsafe connector config permissions");
assertIncludes(deviceNextSource, "connectorConfigPermissionsReady(configDir, configPath)", "device:next pairing readiness must check connector config permissions");
assertIncludes(deviceNextSource, "advertised address(es) served ping and snapshot", "device:next must summarize connector reachability without raw hosts");
assertNotIncludes(deviceNextSource, "no ${configPath}", "device:next must not interpolate raw connector config paths");
assertNotIncludes(deviceNextSource, "on ${host}", "device:next must not print raw successful connector hosts");
assertNotIncludes(deviceNextSource, "Local.xcconfig uses ${config.DEVELOPMENT_TEAM}", "device:next must not print local Apple Team IDs in mismatch output");
assertNotIncludes(devicePreflightSource, "pass(\"DEVELOPMENT_TEAM\", config.DEVELOPMENT_TEAM)", "device preflight must not print local Apple Team IDs");
assertNotIncludes(signingDiagnoseSource, "pass(\"DEVELOPMENT_TEAM\", config.DEVELOPMENT_TEAM)", "signing diagnosis must not print local Apple Team IDs");
assertNotIncludes(signingDiagnoseSource, "pass(\"DEVELOPMENT_TEAM identity match\", config.DEVELOPMENT_TEAM)", "signing diagnosis must not print matching Team IDs");
assertNotIncludes(signingDiagnoseSource, "DEVELOPMENT_TEAM = ${teamIds[0]}", "signing diagnosis must not print inferred Team IDs in suggested edits");
assertNotIncludes(signingDiagnoseSource, "teamIds.join(\", \")", "signing diagnosis must not print local Team ID lists");
assertIncludes(devicePreflightSource, "served Swift-valid snapshot", "device preflight must summarize mock QR host success without raw hosts");
assertIncludes(devicePreflightSource, "physical iPhone", "device preflight must summarize visible devices without raw identifiers");
assertIncludes(devicePreflightSource, "fs.rmSync(configDir, { recursive: true, force: true })", "device preflight must clean temporary connector config");
assertNotIncludes(devicePreflightSource, "hosts.join(\", \")", "device preflight must not print raw pairing host candidates");
assertNotIncludes(devicePreflightSource, "reachable.join(\", \")", "device preflight must not print raw reachable QR hosts");
assertNotIncludes(devicePreflightSource, "failed.join(\", \")", "device preflight must not print raw failed QR hosts");
assertNotIncludes(devicePreflightSource, "physicalIphones[0].raw", "device preflight must not print raw xctrace device lines");
assertNotIncludes(deviceNextSource, "physicalIphones[0].raw", "device:next must not print raw xctrace device lines");
assertIncludes(smokeLocalPairingSource, "address(es)", "local pairing smoke must summarize reachable hosts without raw LAN output");
assertIncludes(smokeLocalPairingSource, "fallback addresses failed", "local pairing smoke must summarize fallback failures without raw LAN output");
assertIncludes(smokeConnectorSource, "fs.rmSync(configDir, { recursive: true, force: true })", "connector smoke must clean temporary connector config");
assertIncludes(smokeLocalPairingSource, "fs.rmSync(configDir, { recursive: true, force: true })", "local pairing smoke must clean temporary connector config");
assertIncludes(smokeLocalApprovalSource, "fs.rmSync(configDir, { recursive: true, force: true })", "local approval smoke must clean temporary connector config");
assertNotIncludes(smokeLocalPairingSource, "reachableHosts.join", "local pairing smoke must not print raw reachable LAN hosts");
assertNotIncludes(smokeLocalPairingSource, "`${item.host}", "local pairing smoke must not print raw failed LAN hosts");
assertNotIncludes(smokeLocalPairingSource, "Host ${host}", "local pairing smoke errors must not include raw LAN host values");
assertIncludes(connectorCliSource, "buildPublicLiveCheck", "connector status/doctor must publish a redacted live-check summary");
assertIncludes(connectorCliSource, "reachableAddressCount", "connector status/doctor live checks must expose address counts instead of raw hosts");
assertIncludes(connectorCliSource, "buildPublicServiceStatus", "connector status/doctor must publish a redacted service summary");
assertNotIncludes(connectorCliSource, "pairingPayloadRedacted", "routine connector status must not print redacted pairing payloads that still contain hosts");
assertIncludes(deviceInstallSource, "redactedSelector(device.selector)", "device install must redact device selectors in multi-device output");
assertIncludes(deviceInstallSource, "Build log:", "device install build step must print a relative log artifact instead of raw xcodebuild output");
assertNotIncludes(deviceInstallSource, "deviceSelector:", "device install summary must not retain device selectors");
assertNotIncludes(deviceInstallSource, "device.raw", "device install must not print raw xctrace device lines");
assertNotIncludes(deviceInstallSource, "stdio: \"inherit\"", "device install must not stream raw xcodebuild output");
assertNotIncludes(deviceInstallSource, "Install result JSON: ${jsonOutput}", "device install must not print absolute temp JSON paths");
assertNotIncludes(deviceInstallSource, "Install result JSON:", "device install must not advertise raw devicectl JSON artifacts");
assertNotIncludes(deviceInstallSource, "Install log:", "device install must not advertise raw devicectl log artifacts");
assertNotIncludes(deviceInstallSource, "Using iPhone: ${device.name}", "device install must not print raw device names");
assertIncludes(iosTestBuildSource, "Native XCTest build log:", "native XCTest build proof must print a bounded log artifact path");
assertNotIncludes(iosTestBuildSource, "process.stdout.write", "native XCTest build proof must not stream raw xcodebuild stdout");
assertIncludes(appIntentFreshSource, "Unsigned AppIntent build log:", "AppIntent freshness rebuild must print a bounded log artifact path");
assertNotIncludes(appIntentFreshSource, "process.stdout.write", "AppIntent freshness rebuild must not stream raw xcodebuild stdout");
assertBefore(
  deviceEvidenceSource,
  "for (const row of rows)",
  "if (screenshotSummary.approvalMissingOrInvalidCount > 0)",
  "device:evidence should print the approval loop after the audit rows"
);

const approvalPending = findScreenshot("08-approval-pending.png");
assertIncludes(approvalPending.expectedEvidence, "npm run connector:approvals:seed", "08 approval proof must start from the Mac-owned seed script");
assertIncludes(approvalPending.expectedEvidence, "从 Mac 拉请求", "08 approval proof must fetch the Mac-owned request from iPhone");
assertNotIncludes(approvalPending.expectedEvidence, "放一个测试请求", "08 approval proof must not depend on the local UI-only test request");
assertNotIncludes(approvalPending.expectedEvidence, "本地 UI 测试请求", "08 approval proof must not depend on the local UI-only test request");
const approvalDecision = findScreenshot("09-approval-decision.png");
assertIncludes(approvalDecision.expectedEvidence, "npm run connector:approvals", "09 approval proof must inspect the Mac-side approvals summary");
assertNotIncludes(approvalDecision.expectedEvidence, "放一个测试请求", "09 approval proof must not depend on the local UI-only test request");
assertNotIncludes(approvalDecision.expectedEvidence, "本地 UI 测试请求", "09 approval proof must not depend on the local UI-only test request");
const approvalAppDiagnostic = findScreenshot("11-approval-app-diagnostic.png");
assertIncludes(approvalAppDiagnostic.expectedEvidence, "快速批准", "11 approval proof must capture the app approval diagnostic section");
assertIncludes(approvalAppDiagnostic.expectedEvidence, "App 上次", "11 approval proof must capture app-origin diagnostic evidence");
assertIncludes(approvalAppDiagnostic.expectedEvidence, "no token/host/URL/body", "11 approval proof must require token-safe diagnostic text");
assertNotIncludes(approvalAppDiagnostic.expectedEvidence, "本地 UI 测试请求", "11 approval proof must not depend on the local UI-only test request");
const approvalWidgetDiagnostic = findScreenshot("12-approval-widget-diagnostic.png");
assertIncludes(approvalWidgetDiagnostic.expectedEvidence, "快速批准", "12 approval proof must capture the app approval diagnostic section");
assertIncludes(approvalWidgetDiagnostic.expectedEvidence, "Widget 上次", "12 approval proof must capture widget-origin diagnostic evidence");
assertIncludes(approvalWidgetDiagnostic.expectedEvidence, "no token/host/URL/body", "12 approval proof must require token-safe diagnostic text");
assertNotIncludes(approvalWidgetDiagnostic.expectedEvidence, "本地 UI 测试请求", "12 approval proof must not depend on the local UI-only test request");
const localNetworkPermission = findScreenshot("10-local-network-permission.png");
assertIncludes(localNetworkPermission.expectedEvidence, "Local Network", "10 proof must explicitly cover iOS Local Network permission");
const qrPairing = findScreenshot("02-qr-pairing.png");
assertIncludes(qrPairing.expectedEvidence, "host count/port", "02 QR proof must require bounded host count/port display");
assertIncludes(qrPairing.expectedEvidence, "no raw LAN host or token", "02 QR proof must reject raw LAN host/token display");
const lanCache = findScreenshot("03-lan-cache.png");
assertIncludes(lanCache.expectedEvidence, "no token or raw host", "03 LAN proof must reject token/raw-host diagnostics");
assertIncludes(readme, "no token or raw host", "device evidence README must reject token/raw-host diagnostics for 03 LAN proof");
const widgetLan = findScreenshot("04-widget-lan.png");
assertIncludes(widgetLan.expectedEvidence, "no token/host/URL/body", "04 Widget LAN proof must reject token/host/URL/body diagnostics");
assertIncludes(readme, "no token/host/URL/body", "device evidence README must reject token/host/URL/body diagnostics for 04 Widget LAN proof");
assertIncludes(readme, "`10-local-network-permission.png`", "README screenshot table must include Local Network permission proof");
assertIncludes(readme, "`11-approval-app-diagnostic.png`", "README screenshot table must include app approval diagnostic proof");
assertIncludes(readme, "`12-approval-widget-diagnostic.png`", "README screenshot table must include widget approval diagnostic proof");
assertIncludes(rootReadme, "`10-local-network-permission.png`", "root README phone checklist must mention Local Network permission screenshot");
assertIncludes(rootReadme, "`11-approval-app-diagnostic.png`", "root README phone checklist must mention app approval diagnostic screenshot");
assertIncludes(rootReadme, "`12-approval-widget-diagnostic.png`", "root README phone checklist must mention widget approval diagnostic screenshot");
assertIncludes(readme, "After install proof exists, strict `npm run device:evidence` exits nonzero", "device evidence README must document strict screenshot blocking after install proof");

for (const item of screenshots) {
  if (typeof item.label !== "string" || item.label.length === 0 || item.label.length > 80) {
    fail(`${item.filename} has invalid label`);
  }
  if (typeof item.expectedEvidence !== "string" || item.expectedEvidence.length === 0 || item.expectedEvidence.length > 180) {
    fail(`${item.filename} has invalid expectedEvidence`);
  }
}

if (fs.existsSync(readinessPath)) {
  validateReadinessArtifact(JSON.parse(fs.readFileSync(readinessPath, "utf8")));
}
if (fs.existsSync(evidenceSummaryPath)) {
  validateEvidenceSummaryArtifact(JSON.parse(fs.readFileSync(evidenceSummaryPath, "utf8")));
}
if (fs.existsSync(localEvidenceSummaryPath)) {
  const artifact = JSON.parse(fs.readFileSync(localEvidenceSummaryPath, "utf8"));
  validateEvidenceSummaryArtifact(artifact);
  if (artifact.mode !== "local-only") {
    fail("00-local-evidence-summary.json mode must be local-only");
  }
}
if (fs.existsSync(screenshotProofsPath)) {
  validateScreenshotProofsArtifact(JSON.parse(fs.readFileSync(screenshotProofsPath, "utf8")));
}

console.log("validated device evidence docs and readiness artifact policy");

function validateReadinessArtifact(artifact) {
  const expectedKeys = [
    "schemaVersion",
    "generatedAt",
    "status",
    "nextGate",
    "localPreflightReady",
    "localPreflightWarnings",
    "localPreflightFailures",
    "configReady",
    "signingReady",
    "teamMismatch",
    "xcodeDeviceVisible",
    "coreDeviceVisible",
    "unsignedIphoneosBuildPresent",
    "unsignedIphoneosBuildFresh",
    "signedInstallableProductReady",
    "installSummaryPresent",
    "installSummaryReady",
    "pairingReady",
    "screenshotManifestReady",
    "screenshotManifestCount",
    "screenshotProofMissingOrInvalidCount",
    "approvalScreenshotProofMissingOrInvalidCount",
    "approvalQaScriptsPresent",
  ];
  assertSameList(expectedKeys, Object.keys(artifact), "00-device-readiness.json schema keys must stay stable");

  if (artifact.schemaVersion !== 1) {
    fail("00-device-readiness.json schemaVersion must be 1");
  }
  if (Number.isNaN(Date.parse(artifact.generatedAt))) {
    fail("00-device-readiness.json generatedAt must be an ISO date");
  }
  if (!["blocked", "ready"].includes(artifact.status)) {
    fail("00-device-readiness.json status must be blocked or ready");
  }
  if (!/^[a-z0-9-]+$/.test(artifact.nextGate)) {
    fail("00-device-readiness.json nextGate must be a stable kebab-case value");
  }

  for (const key of expectedKeys) {
    if (["schemaVersion", "localPreflightWarnings", "localPreflightFailures", "screenshotManifestCount", "screenshotProofMissingOrInvalidCount", "approvalScreenshotProofMissingOrInvalidCount"].includes(key)) {
      if (!Number.isInteger(artifact[key])) {
        fail(`00-device-readiness.json ${key} must be an integer`);
      }
    } else if (!["generatedAt", "status", "nextGate"].includes(key) && typeof artifact[key] !== "boolean") {
      fail(`00-device-readiness.json ${key} must be boolean`);
    }
  }

  const serialized = JSON.stringify(artifact);
  if (containsForbiddenEvidenceText(serialized)) {
    fail("00-device-readiness.json must stay token-free and omit raw command/device/signing details");
  }
}

function validateEvidenceSummaryArtifact(artifact) {
  const expectedKeys = [
    "schemaVersion",
    "generatedAt",
    "mode",
    "status",
    "passCount",
    "warningCount",
    "failureCount",
    "installEvidenceReady",
    "screenshotManifestReady",
    "screenshotProofRequiredCount",
    "screenshotProofPresentCount",
    "screenshotProofMissingOrInvalidCount",
    "approvalScreenshotProofMissingOrInvalidCount",
    "approvalQaScriptsPresent",
    "failedChecks",
    "warningChecks",
  ];
  assertSameList(expectedKeys, Object.keys(artifact), "00-evidence-summary.json schema keys must stay stable");

  if (artifact.schemaVersion !== 1) {
    fail("00-evidence-summary.json schemaVersion must be 1");
  }
  if (Number.isNaN(Date.parse(artifact.generatedAt))) {
    fail("00-evidence-summary.json generatedAt must be an ISO date");
  }
  if (!["strict", "local-only"].includes(artifact.mode)) {
    fail("00-evidence-summary.json mode must be strict or local-only");
  }
  if (!["blocked", "ready"].includes(artifact.status)) {
    fail("00-evidence-summary.json status must be blocked or ready");
  }
  if (
    artifact.mode === "strict" &&
    artifact.installEvidenceReady &&
    artifact.screenshotProofMissingOrInvalidCount > 0 &&
    artifact.status !== "blocked"
  ) {
    fail("00-evidence-summary.json must be blocked when strict post-install screenshot proof is incomplete");
  }

  for (const key of ["passCount", "warningCount", "failureCount", "screenshotProofRequiredCount", "screenshotProofPresentCount", "screenshotProofMissingOrInvalidCount", "approvalScreenshotProofMissingOrInvalidCount"]) {
    if (!Number.isInteger(artifact[key]) || artifact[key] < 0) {
      fail(`00-evidence-summary.json ${key} must be a non-negative integer`);
    }
  }
  for (const key of ["installEvidenceReady", "screenshotManifestReady", "approvalQaScriptsPresent"]) {
    if (typeof artifact[key] !== "boolean") {
      fail(`00-evidence-summary.json ${key} must be boolean`);
    }
  }
  for (const key of ["failedChecks", "warningChecks"]) {
    if (!Array.isArray(artifact[key]) || artifact[key].some((value) => typeof value !== "string" || value.length === 0 || value.length > 80)) {
      fail(`00-evidence-summary.json ${key} must contain bounded check names`);
    }
  }

  const serialized = JSON.stringify(artifact);
  if (containsForbiddenEvidenceText(serialized)) {
    fail("00-evidence-summary.json must stay token-free and omit raw command/device/signing details");
  }
}

function validateScreenshotProofsArtifact(artifact) {
  const expectedKeys = [
    "schemaVersion",
    "generatedAt",
    "screenshots",
  ];
  assertSameList(expectedKeys, Object.keys(artifact), "screenshot-proofs.json schema keys must stay stable");

  if (artifact.schemaVersion !== 1) {
    fail("screenshot-proofs.json schemaVersion must be 1");
  }
  if (Number.isNaN(Date.parse(artifact.generatedAt))) {
    fail("screenshot-proofs.json generatedAt must be an ISO date");
  }
  if (artifact.screenshots === null || typeof artifact.screenshots !== "object" || Array.isArray(artifact.screenshots)) {
    fail("screenshot-proofs.json screenshots must be an object");
  }

  const entryKeys = [
    "manifestIndex",
    "label",
    "expectedEvidenceHash",
    "fileSha256",
    "byteSize",
    "width",
    "height",
    "fileModifiedAt",
  ];

  for (const [filename, entry] of Object.entries(artifact.screenshots)) {
    const manifestIndex = manifestFiles.indexOf(filename);
    if (manifestIndex === -1) {
      fail(`screenshot-proofs.json contains unknown screenshot ${filename}`);
    }
    assertSameList(entryKeys, Object.keys(entry), `screenshot-proofs.json ${filename} entry keys must stay stable`);

    const manifestItem = screenshots[manifestIndex];
    if (entry.manifestIndex !== manifestIndex + 1) {
      fail(`screenshot-proofs.json ${filename} manifestIndex mismatch`);
    }
    if (entry.label !== manifestItem.label) {
      fail(`screenshot-proofs.json ${filename} label mismatch`);
    }
    for (const key of ["expectedEvidenceHash", "fileSha256"]) {
      if (typeof entry[key] !== "string" || !/^sha256:[a-f0-9]{64}$/.test(entry[key])) {
        fail(`screenshot-proofs.json ${filename} ${key} must be a sha256 hash`);
      }
    }
    for (const key of ["byteSize", "width", "height"]) {
      if (!Number.isInteger(entry[key]) || entry[key] <= 0) {
        fail(`screenshot-proofs.json ${filename} ${key} must be a positive integer`);
      }
    }
    if (Number.isNaN(Date.parse(entry.fileModifiedAt))) {
      fail(`screenshot-proofs.json ${filename} fileModifiedAt must be an ISO date`);
    }
  }

  const serialized = JSON.stringify(artifact);
  if (containsForbiddenEvidenceText(serialized)) {
    fail("screenshot-proofs.json must stay token-free and omit raw command/device/signing details");
  }
}

function containsForbiddenEvidenceText(text) {
  return /(token|bearer|authorization|cookie|keychain|transcript|stdout|stderr|development_team|teamId|deviceSelector|raw|udid|identifier)/i.test(text);
}

function assertSameList(expected, actual, message) {
  if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
    fail(`${message}; expected [${expected.join(", ")}], got [${actual.join(", ")}]`);
  }
}

function assertIncludes(text, expected, message) {
  if (!text.includes(expected)) {
    fail(`${message}; missing "${expected}"`);
  }
}

function assertNotIncludes(text, unexpected, message) {
  if (text.includes(unexpected)) {
    fail(`${message}; found "${unexpected}"`);
  }
}

function assertBefore(text, first, second, message) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex > secondIndex) {
    fail(message);
  }
}

function findScreenshot(filename) {
  const item = screenshots.find((screenshot) => screenshot.filename === filename);
  if (!item) {
    fail(`manifest.json must include ${filename}`);
  }
  return item;
}

function assertPackageScript(name, expectedCommandText) {
  const script = packageJson.scripts?.[name];
  if (typeof script !== "string" || !script.includes(expectedCommandText)) {
    fail(`package.json must define ${name} with "${expectedCommandText}"`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
