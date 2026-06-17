import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "outputs", "device-evidence", "manifest.json");

function readManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("outputs/device-evidence/manifest.json is missing");
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const screenshots = manifest?.requiredScreenshots;
  if (manifest?.schemaVersion !== 1 || !Array.isArray(screenshots) || screenshots.length === 0) {
    throw new Error("device screenshot manifest is invalid");
  }

  return screenshots;
}

function printCommands(commands) {
  for (const command of commands) {
    console.log(`  ${command}`);
  }
}

function printSection(title) {
  console.log(`\n${title}`);
}

const screenshots = readManifest();

console.log("AI Usage Widget iPhone proof runbook");
console.log("This is token-safe. It does not print pairing payloads, bearer tokens, device identifiers, or raw command output.");

printSection("1. Keep local proof green while signing is blocked");
printCommands([
  "npm run device:preflight:local",
  "npm run device:build:unsigned",
  "npm run device:evidence:local",
  "npm run device:next",
]);

printSection("2. Configure Apple signing");
console.log("  Open Xcode Settings > Accounts, sign in, create/download an Apple Development certificate, then apply DEVELOPMENT_TEAM safely.");
printCommands([
  "npm run device:signing:apply",
  "npm run device:signing",
  "npm run device:preflight",
]);

printSection("3. Build and install on iPhone 16 Pro Max");
printCommands([
  "npm run device:build",
  "npm run device:install",
]);
console.log("  If CoreDevice is flaky, install AIUsageWidgetApp from Xcode, then keep going with the phone proof loop.");

printSection("4. Start or verify the Mac connector before QR pairing");
console.log("  First check whether the optional LaunchAgent is already loaded on port 8787.");
printCommands([
  "npm run connector:service:status",
]);
console.log("  If it is loaded/running, use it for the first QR proof and confirm the live endpoint shape.");
printCommands([
  "npm run connector:status:live",
]);
console.log("  If you specifically want the fixture mock proof and the service already owns port 8787, unload it first.");
printCommands([
  "npm run connector:service:unload",
]);
console.log("  Otherwise, in one terminal, start the local connector. Use mock for first phone proof.");
printCommands([
  "npm run start:mock",
]);
console.log("  After the mock path works, stop npm run start:mock before starting npm run start:real or reloading the LaunchAgent; all three use port 8787.");
printCommands([
  "npm run start:real",
  "npm run connector:service:load",
]);
console.log("  In another terminal, confirm the Mac can reach authenticated ping/snapshot before scanning QR.");
printCommands([
  "npm run connector:status:live",
]);
console.log("  The iPhone still needs its own Local Network permission proof; Mac-local reachability is not enough.");

printSection("5. Run the phone proof loop in this order");
for (const [index, item] of screenshots.entries()) {
  console.log(`  ${index + 1}. ${item.filename} - ${item.expectedEvidence}`);
  if (item.filename === "02-qr-pairing.png") {
    console.log("     Start the connector first, then scan the QR normally or paste npm run pair:manual output.");
  }
  if (item.filename === "10-local-network-permission.png") {
    console.log("     Capture the iOS Local Network prompt, or Settings > AI Usage with Local Network enabled.");
  }
  if (item.filename === "08-approval-pending.png") {
    console.log("     Start this proof with npm run connector:approvals:seed, then tap 从 Mac 拉请求.");
  }
  if (item.filename === "09-approval-decision.png") {
    console.log("     Confirm the Mac receipt with npm run connector:approvals, then reset with npm run connector:approvals:clear.");
  }
  if (item.filename === "11-approval-app-diagnostic.png") {
    console.log("     After an app-button decision, capture 快速批准 showing App 上次 with bounded detail only.");
  }
  if (item.filename === "12-approval-widget-diagnostic.png") {
    console.log("     After a Widget AppIntent decision, open the app and capture 快速批准 showing Widget 上次 with bounded detail only.");
  }
}

printSection("6. Bind screenshots to machine-checkable evidence");
console.log("  Save PNG screenshots into outputs/device-evidence with the exact filenames above.");
printCommands([
  "npm run device:evidence",
  "npm run device:evidence",
]);
console.log("  First run writes outputs/device-evidence/screenshot-proofs.json; second run proves the current files still match the manifest and fingerprints.");
