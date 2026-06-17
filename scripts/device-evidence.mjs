import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { buildFreshness, iosTestBuildFreshness } from "./lib/ios-build-freshness.mjs";
import { validateAppIntentMetadata } from "./lib/appintent-metadata.mjs";
import { postInstallScreenshotGateBlocked, screenshotProofIssueStatus } from "./lib/device-evidence-policy.mjs";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const localOnly = args.includes("--local-only");
const unknownArgs = args.filter((arg) => arg !== "--local-only");
if (unknownArgs.length > 0) {
  console.error("Usage: node scripts/device-evidence.mjs [--local-only]");
  process.exit(2);
}
const rows = [];
const evidenceDir = path.join(repoRoot, "outputs", "device-evidence");
const evidenceSummaryPath = path.join(evidenceDir, localOnly ? "00-local-evidence-summary.json" : "00-evidence-summary.json");
const screenshotProofsPath = path.join(evidenceDir, "screenshot-proofs.json");
let installEvidenceReady = false;
let installEvidenceInstalledAtMs = null;
const screenshotSummary = {
  manifestReady: false,
  requiredCount: 0,
  presentCount: 0,
  missingOrInvalidCount: 0,
  approvalMissingOrInvalidCount: 0,
};
let snapshotParser;

function record(status, name, detail, hint) {
  rows.push({ status, name, detail, hint });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function warn(name, detail, hint) {
  record("WARN", name, detail, hint);
}

function fail(name, detail, hint) {
  record("FAIL", name, detail, hint);
}

function addressSummary(count, noun = "address") {
  return `${count} ${noun}${count === 1 ? "" : "es"}`;
}

function recordScreenshotProofIssue(name, detail, hint) {
  record(
    screenshotProofIssueStatus({ localOnly, installEvidenceReady }),
    name,
    detail,
    hint
  );
}

function printCommands(commands) {
  for (const command of commands) {
    console.log(`  ${command}`);
  }
}

function printApprovalQaCommands() {
  console.log("\nApproval screenshot loop:");
  printCommands([
    "npm run connector:approvals:seed",
    "tap 从 Mac 拉请求 on iPhone",
    "approve/deny from the app and capture 11-approval-app-diagnostic.png with App 上次",
    "npm run connector:approvals:seed",
    "tap 从 Mac 拉请求 on iPhone again",
    "approve/deny from the widget and capture 12-approval-widget-diagnostic.png with Widget 上次",
    "npm run connector:approvals",
    "npm run connector:approvals:clear",
  ]);
  console.log("  Use 本地 UI 测试请求 only for local UI proof before the paired Mac loop.");
}

function isApprovalScreenshot(item) {
  return /^\d{2}-approval-/.test(item.filename);
}

function sha256Hex(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function approvalQaScriptsPresent() {
  try {
    const packageJson = JSON.parse(readFile("package.json"));
    return Boolean(
      packageJson.scripts?.["connector:approvals:seed"]?.includes("approvals seed") &&
        packageJson.scripts?.["connector:approvals"]?.includes("approvals") &&
        packageJson.scripts?.["connector:approvals:clear"]?.includes("approvals clear")
    );
  } catch {
    return false;
  }
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function parseXcconfig(relativePath) {
  const values = {};
  if (!exists(relativePath)) {
    return values;
  }

  for (const line of readFile(relativePath).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    values[key.trim()] = rest.join("=").trim();
  }

  return values;
}

function ageLabel(stat) {
  const seconds = Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000));
  if (seconds < 90) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return `${Math.round(hours / 24)}d ago`;
}

function checkSigningEvidence() {
  const configPath = "ios/Config/Local.xcconfig";
  if (!exists(configPath)) {
    fail("Signing config", "missing", "Copy ios/Config/Local.xcconfig.example before the device loop.");
    return;
  }

  const config = parseXcconfig(configPath);
  if (config.DEVELOPMENT_TEAM) {
    pass("Signing team", "DEVELOPMENT_TEAM is set");
  } else if (localOnly) {
    warn("Signing team", "DEVELOPMENT_TEAM is empty", "Skipped for --local-only; strict device:evidence remains the real post-install gate.");
  } else {
    fail("Signing team", "DEVELOPMENT_TEAM is empty", "Real-device install cannot be proven until Xcode has a Personal Team here.");
  }

  if (config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX && config.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    pass("Bundle/App Group ids", `${config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX} / ${config.APP_GROUP_IDENTIFIER}`);
  } else {
    fail("Bundle/App Group ids", "missing or malformed", "Bundle prefix and App Group must be filled before device signing.");
  }

  return config;
}

function checkProjectEvidence(config) {
  if (exists("ios/AIUsageWidget.xcodeproj/project.pbxproj")) {
    pass("Generated Xcode project", "present");
  } else {
    fail("Generated Xcode project", "missing", "Run npm run generate:ios before opening Xcode.");
  }

  if (exists("ios/AIUsageWidgetApp/AIUsageWidgetApp.entitlements") && exists("ios/AIUsageWidgetExtension/AIUsageWidgetExtension.entitlements")) {
    pass("App/widget entitlements", "present");
  } else {
    fail("App/widget entitlements", "missing", "Both targets need App Group entitlements.");
  }

  checkAppGroupEvidence(config);
  checkDeeplinkEvidence();
  checkCameraSourceEvidence();
  checkLaunchScreenSourceEvidence();
  checkLocalNetworkSourceEvidence();
  checkPrivacyManifestSourceEvidence();
}

function checkAppGroupEvidence(config) {
  const appPlist = "ios/AIUsageWidgetApp/Info.plist";
  const widgetPlist = "ios/AIUsageWidgetExtension/Info.plist";
  const appEntitlements = "ios/AIUsageWidgetApp/AIUsageWidgetApp.entitlements";
  const widgetEntitlements = "ios/AIUsageWidgetExtension/AIUsageWidgetExtension.entitlements";

  const sourceFiles = [appPlist, widgetPlist, appEntitlements, widgetEntitlements];
  if (sourceFiles.every(exists) && sourceFiles.every((file) => readFile(file).includes("$(APP_GROUP_IDENTIFIER)"))) {
    pass("Source App Group wiring", "app/widget plists and entitlements use $(APP_GROUP_IDENTIFIER)");
  } else {
    fail("Source App Group wiring", "missing build setting reference", "App and widget must share the same App Group build setting.");
  }

  if (!config?.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    warn("Built App Group values", "skipped without valid APP_GROUP_IDENTIFIER", "Fill local signing config before checking expanded build products.");
    return;
  }

  checkBuiltAppGroup(
    "Simulator App Group value",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphonesimulator/AIUsageWidgetApp.app"),
    config.APP_GROUP_IDENTIFIER
  );
  checkBuiltAppGroup(
    "Device App Group value",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app"),
    config.APP_GROUP_IDENTIFIER
  );
}

function checkBuiltAppGroup(name, appPath, expectedGroup) {
  if (!fs.existsSync(appPath)) {
    warn(name, "build product not found", "Build this configuration before checking expanded App Group values.");
    return;
  }

  const appValue = plistValue(path.join(appPath, "Info.plist"), "AIUsageAppGroupIdentifier");
  const extensionPath = embeddedWidgetPath(appPath);
  const widgetValue = extensionPath
    ? plistValue(path.join(extensionPath, "Info.plist"), "AIUsageAppGroupIdentifier")
    : undefined;

  if (appValue === expectedGroup && widgetValue === expectedGroup) {
    pass(name, `${expectedGroup} in app and widget`);
  } else {
    fail(
      name,
      `app=${appValue ?? "missing"}, widget=${widgetValue ?? "missing"}`,
      "Expanded App Group values must match ios/Config/Local.xcconfig."
    );
  }
}

function plistValue(file, key) {
  if (!fs.existsSync(file)) {
    return undefined;
  }

  const result = spawnSync("plutil", ["-extract", key, "raw", "-o", "-", file], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 64 * 1024,
  });
  if (result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim();
}

function plistDump(file) {
  if (!fs.existsSync(file)) {
    return "";
  }

  const result = spawnSync("plutil", ["-p", file], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 64 * 1024,
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout;
}

function plistJSON(file) {
  if (!fs.existsSync(file)) {
    return undefined;
  }

  const result = spawnSync("plutil", ["-convert", "json", "-o", "-", file], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 128 * 1024,
  });
  if (result.status !== 0) {
    return undefined;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return undefined;
  }
}

function checkBuildProducts() {
  const deviceAppPath = path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app");
  checkBuildProductSet("Device build products", "Debug-iphoneos", "Run npm run device:build:unsigned for compile proof before signing is ready, then npm run device:build after signing is configured.");
  checkInstallableDeviceProduct(deviceAppPath);
  checkBuildProductSet("Simulator build products", "Debug-iphonesimulator", "Run npm run build:ios:sim after Swift changes.");
  checkBuiltLocalNetwork(
    "Simulator Local Network values",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphonesimulator/AIUsageWidgetApp.app"),
    "Build the simulator app before checking expanded Local Network plist values."
  );
  checkBuiltLocalNetwork(
    "Device Local Network values",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app"),
    "Expected until DEVELOPMENT_TEAM and iPhone visibility are fixed."
  );
  checkBuiltPrivacyManifest(
    "Simulator privacy manifests",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphonesimulator/AIUsageWidgetApp.app"),
    "Build the simulator app before checking bundled PrivacyInfo.xcprivacy files."
  );
  checkBuiltPrivacyManifest(
    "Device privacy manifests",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app"),
    "Run npm run device:build:unsigned for unsigned compile proof before signing is ready."
  );
  checkBuiltDeeplink(
    "Simulator deeplink value",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphonesimulator/AIUsageWidgetApp.app"),
    "Build the simulator app before checking expanded URL schemes."
  );
  checkBuiltDeeplink(
    "Device deeplink value",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app"),
    "Expected until DEVELOPMENT_TEAM and iPhone visibility are fixed."
  );
  checkBuiltCameraUsage(
    "Simulator camera usage value",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphonesimulator/AIUsageWidgetApp.app"),
    "Build the simulator app before checking QR scanner camera permission text."
  );
  checkBuiltCameraUsage(
    "Device camera usage value",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app"),
    "Expected until DEVELOPMENT_TEAM and iPhone visibility are fixed."
  );
  checkBuiltLaunchScreen(
    "Simulator launch screen value",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphonesimulator/AIUsageWidgetApp.app"),
    "Build the simulator app before checking launch-screen config."
  );
  checkBuiltLaunchScreen(
    "Device launch screen value",
    path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app"),
    "Expected until DEVELOPMENT_TEAM and iPhone visibility are fixed."
  );
  checkAppIntentMetadata();
  checkNativeXCTestBuild();
}

function checkBuildProductSet(name, configurationDir, missingHint) {
  const productsDir = path.join(repoRoot, "build", "DerivedData", "Build", "Products", configurationDir);
  const appPath = path.join(productsDir, "AIUsageWidgetApp.app");
  const widgetPath = embeddedWidgetPath(appPath) ?? path.join(productsDir, "AIUsageWidgetExtension.appex");

  if (fs.existsSync(appPath) && fs.existsSync(widgetPath)) {
    if (configurationDir === "Debug-iphoneos") {
      const freshness = buildFreshness(repoRoot, configurationDir);
      if (!freshness.fresh) {
        fail(name, `stale build product: ${freshness.detail}`, "Run npm run device:build:unsigned after iOS source/config changes, then rerun evidence.");
        return;
      }
    }
    const appAge = ageLabel(fs.statSync(appPath));
    const widgetAge = ageLabel(fs.statSync(widgetPath));
    pass(name, `app ${appAge}, widget ${widgetAge}`);
  } else if (fs.existsSync(appPath)) {
    fail(name, "app exists but widget extension is missing", "The app must embed AIUsageWidgetExtension.appex.");
  } else {
    warn(name, "not found", missingHint);
  }
}

function embeddedWidgetPath(appPath) {
  const embedded = path.join(appPath, "PlugIns", "AIUsageWidgetExtension.appex");
  if (fs.existsSync(embedded)) {
    return embedded;
  }
  return undefined;
}

function checkAppIntentMetadata() {
  const result = validateAppIntentMetadata(repoRoot);

  for (const row of result.rows) {
    const name = `AppIntent ${row.name}`;
    if (row.status === "PASS") {
      pass(name, row.detail);
    } else {
      fail(name, row.detail, "Run npm run device:build:unsigned; the built widget AppIntent metadata must stay refresh plus approve/deny-only and in-place.");
    }
  }
}

function checkNativeXCTestBuild() {
  const freshness = iosTestBuildFreshness(repoRoot);
  if (freshness.present && freshness.fresh) {
    pass("Native XCTest build proof", freshness.detail);
    return;
  }

  fail(
    "Native XCTest build proof",
    freshness.present ? `stale build product: ${freshness.detail}` : `missing build product: ${freshness.detail}`,
    "Run npm run build:ios:tests after iOS source/config changes, then rerun evidence."
  );
}

function commandText(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function stripLocalPaths(text) {
  return text
    .replaceAll(repoRoot, "<repo>")
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<home>");
}

function verifyCodeSignature(bundlePath) {
  const result = spawnSync("codesign", ["--verify", "--strict", bundlePath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 128 * 1024,
  });

  return {
    ok: result.status === 0,
    detail: stripLocalPaths(commandText(result).trim()) || `exit ${result.status}`,
  };
}

function codesignEntitlements(bundlePath) {
  const result = spawnSync("codesign", ["-d", "--entitlements", ":-", bundlePath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 256 * 1024,
  });
  if (result.status !== 0) {
    return "";
  }
  return commandText(result);
}

function checkInstallableDeviceProduct(appPath) {
  if (!fs.existsSync(appPath)) {
    warn("Device installable product", "skipped without iphoneos app build", "Run npm run device:build after signing is configured.");
    return;
  }

  const widgetPath = embeddedWidgetPath(appPath);
  if (!widgetPath) {
    fail("Device installable product", "embedded widget extension missing", "The installable app must embed AIUsageWidgetExtension.appex.");
    return;
  }

  const config = parseXcconfig("ios/Config/Local.xcconfig");
  const issues = [];
  const appSignature = verifyCodeSignature(appPath);
  const widgetSignature = verifyCodeSignature(widgetPath);
  if (!appSignature.ok) {
    issues.push(`app unsigned or invalid (${appSignature.detail})`);
  }
  if (!widgetSignature.ok) {
    issues.push(`widget unsigned or invalid (${widgetSignature.detail})`);
  }
  if (!fs.existsSync(path.join(appPath, "embedded.mobileprovision"))) {
    issues.push("embedded.mobileprovision missing");
  }

  if (config.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    const appEntitlements = codesignEntitlements(appPath);
    const widgetEntitlements = codesignEntitlements(widgetPath);
    if (!appEntitlements.includes(config.APP_GROUP_IDENTIFIER)) {
      issues.push("app signed entitlements missing App Group");
    }
    if (!widgetEntitlements.includes(config.APP_GROUP_IDENTIFIER)) {
      issues.push("widget signed entitlements missing App Group");
    }
  } else {
    issues.push("APP_GROUP_IDENTIFIER unavailable for signed entitlement check");
  }

  if (issues.length === 0) {
    pass("Device installable product", "app/widget signed, provisioned, and App Group entitlement present");
    return;
  }

  const hint = "Run npm run device:build after DEVELOPMENT_TEAM and provisioning are configured; unsigned builds are compile proof only.";
  if (config.DEVELOPMENT_TEAM) {
    fail("Device installable product", issues.join("; "), hint);
  } else {
    warn("Device installable product", issues.join("; "), hint);
  }
}

function checkLocalNetworkSourceEvidence() {
  const appPlist = path.join(repoRoot, "ios/AIUsageWidgetApp/Info.plist");
  const widgetPlist = path.join(repoRoot, "ios/AIUsageWidgetExtension/Info.plist");

  if (localNetworkPlistReady(appPlist) && localNetworkPlistReady(widgetPlist)) {
    pass("Source Local Network plist", "app/widget allow local networking and include usage descriptions");
  } else {
    fail("Source Local Network plist", "missing local network keys", "App and widget need local networking plist values for same-Wi-Fi connector proof.");
  }
}

function checkCameraSourceEvidence() {
  const appPlist = path.join(repoRoot, "ios/AIUsageWidgetApp/Info.plist");
  const value = plistValue(appPlist, "NSCameraUsageDescription");
  if (value && value.includes("二维码")) {
    pass("Source camera usage plist", "app declares QR scanner camera permission reason");
  } else {
    fail("Source camera usage plist", value ?? "missing", "The iPhone QR scanner needs NSCameraUsageDescription.");
  }
}

function checkLaunchScreenSourceEvidence() {
  const appPlist = path.join(repoRoot, "ios/AIUsageWidgetApp/Info.plist");
  const plist = plistJSON(appPlist);
  if (plist?.UILaunchScreen && typeof plist.UILaunchScreen === "object" && !Array.isArray(plist.UILaunchScreen)) {
    pass("Source launch screen plist", "app declares UILaunchScreen");
  } else {
    fail("Source launch screen plist", "missing", "The app needs UILaunchScreen before device/App Store packaging.");
  }
}

function checkBuiltCameraUsage(name, appPath, missingHint) {
  if (!fs.existsSync(appPath)) {
    warn(name, "build product not found", missingHint);
    return;
  }

  const value = plistValue(path.join(appPath, "Info.plist"), "NSCameraUsageDescription");
  if (value && value.includes("二维码")) {
    pass(name, "QR scanner camera permission text present");
  } else {
    fail(name, value ?? "missing", "The built app must include NSCameraUsageDescription for QR scanning.");
  }
}

function checkBuiltLaunchScreen(name, appPath, missingHint) {
  if (!fs.existsSync(appPath)) {
    warn(name, "build product not found", missingHint);
    return;
  }

  const plist = plistJSON(path.join(appPath, "Info.plist"));
  if (plist?.UILaunchScreen && typeof plist.UILaunchScreen === "object" && !Array.isArray(plist.UILaunchScreen)) {
    pass(name, "UILaunchScreen present in built app");
  } else {
    fail(name, "missing", "The built app must include UILaunchScreen before device/App Store packaging.");
  }
}

function checkBuiltLocalNetwork(name, appPath, missingHint) {
  if (!fs.existsSync(appPath)) {
    warn(name, "build product not found", missingHint);
    return;
  }

  const extensionPath = embeddedWidgetPath(appPath);
  if (
    localNetworkPlistReady(path.join(appPath, "Info.plist")) &&
    extensionPath &&
    localNetworkPlistReady(path.join(extensionPath, "Info.plist"))
  ) {
    pass(name, "app/widget local networking values present");
  } else {
    fail(name, "missing app or widget local networking values", "Both built plists need NSAllowsLocalNetworking and NSLocalNetworkUsageDescription.");
  }
}

function checkPrivacyManifestSourceEvidence() {
  const appManifest = path.join(repoRoot, "ios/AIUsageWidgetApp/PrivacyInfo.xcprivacy");
  const widgetManifest = path.join(repoRoot, "ios/AIUsageWidgetExtension/PrivacyInfo.xcprivacy");

  if (privacyManifestReady(appManifest) && privacyManifestReady(widgetManifest)) {
    pass("Source privacy manifests", "app/widget declare App Group UserDefaults reason, no tracking, and no collected data");
  } else {
    fail("Source privacy manifests", "missing or incomplete", "App and widget use App Group UserDefaults and need PrivacyInfo.xcprivacy coverage.");
  }
}

function checkBuiltPrivacyManifest(name, appPath, missingHint) {
  if (!fs.existsSync(appPath)) {
    warn(name, "build product not found", missingHint);
    return;
  }

  const extensionPath = embeddedWidgetPath(appPath);
  if (
    privacyManifestReady(path.join(appPath, "PrivacyInfo.xcprivacy")) &&
    extensionPath &&
    privacyManifestReady(path.join(extensionPath, "PrivacyInfo.xcprivacy"))
  ) {
    pass(name, "app/widget PrivacyInfo.xcprivacy resources present");
  } else {
    fail(name, "missing app or widget privacy manifest", "Rebuild after adding PrivacyInfo.xcprivacy to both targets.");
  }
}

function privacyManifestReady(file) {
  const plist = plistJSON(file);
  const accessed = plist?.NSPrivacyAccessedAPITypes;
  const userDefaults = Array.isArray(accessed)
    ? accessed.find((entry) => entry?.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults")
    : undefined;

  return Array.isArray(userDefaults?.NSPrivacyAccessedAPITypeReasons) &&
    userDefaults.NSPrivacyAccessedAPITypeReasons.includes("CA92.1") &&
    plist?.NSPrivacyTracking === false &&
    Array.isArray(plist?.NSPrivacyCollectedDataTypes) &&
    plist.NSPrivacyCollectedDataTypes.length === 0;
}

function localNetworkPlistReady(plistPath) {
  return plistValue(plistPath, "NSAppTransportSecurity.NSAllowsLocalNetworking") === "true" &&
    Boolean(plistValue(plistPath, "NSLocalNetworkUsageDescription"));
}

function checkDeeplinkEvidence() {
  const appPlist = "ios/AIUsageWidgetApp/Info.plist";
  const appView = "ios/AIUsageWidgetApp/ContentView.swift";
  const tapProof = "ios/Shared/WidgetTapProof.swift";
  const widgetView = "ios/AIUsageWidgetExtension/AIUsageWidget.swift";

  if (
    exists(appPlist) &&
    readFile(appPlist).includes("<key>CFBundleURLTypes</key>") &&
    readFile(appPlist).includes("<string>aiusage</string>") &&
    exists(widgetView) &&
    readFile(widgetView).includes('widgetURL(URL(string: "aiusage://refresh"))') &&
    exists(appView) &&
    readFile(appView).includes("WidgetRefreshDeepLink.isRefreshURL(url)") &&
    exists(tapProof) &&
    readFile(tapProof).includes('static let scheme = "aiusage"') &&
    readFile(tapProof).includes('static let refreshHost = "refresh"')
  ) {
    pass("Source widget deeplink", "aiusage://refresh registered and handled");
  } else {
    fail("Source widget deeplink", "missing source wiring", "The widget tap target must open the app refresh route.");
  }
}

function checkBuiltDeeplink(name, appPath, missingHint) {
  if (!fs.existsSync(appPath)) {
    warn(name, "build product not found", missingHint);
    return;
  }

  const dump = plistDump(path.join(appPath, "Info.plist"));
  if (dump.includes("CFBundleURLTypes") && dump.includes("aiusage")) {
    pass(name, "aiusage scheme present in built app");
  } else {
    fail(name, "aiusage scheme missing", "The built app must register aiusage://refresh for widget taps.");
  }
}

function aiuwConfigPath() {
  const dir = process.env.AIUW_CONFIG_DIR ?? path.join(os.homedir(), ".aiuw");
  return path.join(dir, "config.json");
}

function readAiuwConfig() {
  const file = aiuwConfigPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(file)) {
    return { file };
  }

  try {
    const dirMode = fs.existsSync(dir) ? `0${(fs.statSync(dir).mode & 0o777).toString(8)}` : "missing";
    const fileMode = `0${(fs.statSync(file).mode & 0o777).toString(8)}`;
    if (dirMode !== "0700") {
      return { file, error: `config directory permissions are ${dirMode}, expected 0700` };
    }
    if (fileMode !== "0600") {
      return { file, error: `config file permissions are ${fileMode}, expected 0600` };
    }

    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.version === 1 && parsed.deviceId && parsed.name && parsed.token) {
      return { file, config: parsed, dirMode, fileMode };
    }
    return { file, error: "config shape is invalid" };
  } catch (error) {
    return { file, error: "pairing config unreadable" };
  }
}

async function checkConnectorEvidence() {
  if (exists("connector/dist/connector/src/cli.js")) {
    pass("Connector build output", "present");
  } else {
    warn("Connector build output", "missing", "Run npm run build:connector before QR/device testing.");
  }

  const configResult = readAiuwConfig();
  if (configResult.config) {
    pass("Connector pairing config", `present (${configResult.dirMode}/${configResult.fileMode})`);
  } else if (configResult.error) {
    fail("Connector pairing config", configResult.error, "Regenerate pairing with npm run pair:manual, or run npm run connector:status to repair config permissions.");
  } else {
    warn("Connector pairing config", "not found", "Start or pair the connector before iPhone QR/manual pairing.");
  }

  await checkLaunchdStatus();
  await checkLiveConnector(configResult.config);
}

async function checkLaunchdStatus() {
  const launchdModulePath = path.join(repoRoot, "connector/dist/connector/src/launchd.js");
  if (!fs.existsSync(launchdModulePath)) {
    warn("LaunchAgent evidence", "launchd module missing", "Build connector before checking run-at-login evidence.");
    return;
  }

  try {
    const launchd = await import(pathToFileURL(launchdModulePath).href);
    const status = await launchd.inspectLaunchdService();
    if (!status.plistExists) {
      warn("LaunchAgent evidence", "not installed", "Optional for QR testing; install only when proving run-at-login behavior.");
      return;
    }
    if (status.launchctl.loaded && status.launchctl.running) {
      pass("LaunchAgent evidence", `loaded and running, plist ${status.plistMode ?? "unknown mode"}`);
    } else if (status.launchctl.loaded) {
      warn("LaunchAgent evidence", "loaded but not reporting running", "Use npm run connector:service:status and connector logs.");
    } else {
      warn("LaunchAgent evidence", "installed but not loaded", "Run npm run connector:service:load only when you want run-at-login behavior.");
    }
  } catch {
    warn("LaunchAgent evidence", "launchd status unavailable", "LaunchAgent proof is optional for local QR testing.");
  }
}

async function checkLiveConnector(config) {
  if (!config) {
    warn("Connector live check", "skipped without pairing config", "Run npm run start:mock or npm run start:real, then pair.");
    return;
  }

  const networkModulePath = path.join(repoRoot, "connector/dist/connector/src/network.js");
  if (!fs.existsSync(networkModulePath)) {
    warn("Connector live check", "network module missing", "Build connector before live connector evidence.");
    return;
  }

  try {
    const network = await import(pathToFileURL(networkModulePath).href);
    const hosts = network.getLanHosts();
    const reachable = [];
    const failed = [];
    for (const host of hosts) {
      try {
        const ok = await connectorHostReady(host, 8787, config.token);
        if (ok) {
          reachable.push(host);
        } else {
          failed.push(host);
        }
      } catch {
        failed.push(host);
      }
    }

    if (reachable.length > 0) {
      pass("Connector live check", `${addressSummary(reachable.length)} answered ping+snapshot`);
      if (failed.length > 0) {
        warn("Connector live check fallbacks", `${addressSummary(failed.length)} failed locally`, "The iPhone will try hosts in order; persistent failures can slow pairing.");
      }
    } else {
      warn("Connector live check", "no advertised host answered both /v1/ping and /v1/snapshot", "Start the connector before scanning the QR.");
    }
  } catch {
    warn("Connector live check", "live connector probe unavailable", "Use npm run connector:status:live for the standard live probe.");
  }
}

async function connectorHostReady(host, port, token) {
  if (!(await isPortOpen(host, port))) {
    return false;
  }

  const headers = {
    authorization: `Bearer ${token}`
  };
  const pingResponse = await fetch(`http://${host}:${port}/v1/ping`, {
    headers,
    signal: AbortSignal.timeout(1_200)
  });
  if (!pingResponse.ok) {
    return false;
  }
  const body = await pingResponse.json();
  if (body?.ok !== true) {
    return false;
  }

  const snapshotResponse = await fetch(`http://${host}:${port}/v1/snapshot`, {
    headers,
    signal: AbortSignal.timeout(1_200)
  });
  if (!snapshotResponse.ok) {
    return false;
  }
  const snapshot = await snapshotResponse.json();
  return snapshotLooksValid(snapshot);
}

function snapshotLooksValid(snapshot) {
  try {
    loadSnapshotParser()(snapshot);
    return true;
  } catch {
    return false;
  }
}

function loadSnapshotParser() {
  if (snapshotParser) {
    return snapshotParser;
  }

  const schemaPath = path.join(repoRoot, "connector/dist/src/contract/schema.js");
  if (!fs.existsSync(schemaPath)) {
    throw new Error("connector contract build output missing");
  }

  const schema = require(schemaPath);
  if (typeof schema.parseSnapshot !== "function") {
    throw new Error("connector contract parser missing");
  }
  snapshotParser = schema.parseSnapshot;
  return snapshotParser;
}

async function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 800 }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function checkInstallEvidence() {
  const file = path.join(evidenceDir, "00-install-summary.json");
  if (!fs.existsSync(file)) {
    warn("Device install evidence", "00-install-summary.json missing", "Run npm run device:install after signing/device visibility are ready.");
    return;
  }

  let summary;
  try {
    summary = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail("Device install evidence", "install summary is not valid JSON", error instanceof Error ? error.message : String(error));
    return;
  }

  const expectedTrueFields = [
    "appSigned",
    "widgetSigned",
    "embeddedMobileprovision",
    "appGroupInAppEntitlements",
    "appGroupInWidgetEntitlements",
  ];
  const missing = expectedTrueFields.filter((field) => summary?.[field] !== true);
  const config = parseXcconfig("ios/Config/Local.xcconfig");
  const expectedAppProduct = "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app";
  const expectedWidgetProduct = `${expectedAppProduct}/PlugIns/AIUsageWidgetExtension.appex`;
  const productIssues = [];
  if (summary?.appProduct !== expectedAppProduct) {
    productIssues.push("appProduct path mismatch");
  }
  if (summary?.widgetProduct !== expectedWidgetProduct) {
    productIssues.push("widgetProduct path mismatch");
  }
  if (summary?.appGroupIdentifier !== config.APP_GROUP_IDENTIFIER) {
    productIssues.push("App Group mismatch");
  }
  const installedAtMs = Date.parse(summary?.installedAt ?? "");
  if (!Number.isFinite(installedAtMs)) {
    productIssues.push("installedAt missing or invalid");
  } else {
    installEvidenceInstalledAtMs = installedAtMs;
    const appPath = path.join(repoRoot, expectedAppProduct);
    const widgetPath = path.join(repoRoot, expectedWidgetProduct);
    for (const [label, productPath] of [["app", appPath], ["widget", widgetPath]]) {
      if (!fs.existsSync(productPath)) {
        productIssues.push(`${label} product missing`);
      } else if (fs.statSync(productPath).mtimeMs - installedAtMs > 1_000) {
        productIssues.push(`${label} product is newer than install summary`);
      }
    }
  }

  if (summary?.schemaVersion === 1 &&
      summary?.status === "success" &&
      summary?.devicectlExitStatus === 0 &&
      missing.length === 0 &&
      productIssues.length === 0) {
    installEvidenceReady = true;
    pass("Device install evidence", "00-install-summary.json proves signed devicectl install");
  } else {
    const issues = [...missing, ...productIssues];
    fail(
      "Device install evidence",
      `install summary is incomplete (${issues.join(", ") || "status/schema mismatch"})`,
      "Re-run npm run device:install after signing/provisioning are configured."
    );
  }
}

function readScreenshotProofs() {
  if (!fs.existsSync(screenshotProofsPath)) {
    return {
      exists: false,
      ok: false,
      detail: "screenshot-proofs.json missing",
      screenshots: {},
    };
  }

  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(screenshotProofsPath, "utf8"));
  } catch (error) {
    return {
      exists: true,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      screenshots: {},
    };
  }

  if (artifact?.schemaVersion !== 1 || typeof artifact?.generatedAt !== "string" || Number.isNaN(Date.parse(artifact.generatedAt)) || artifact?.screenshots === null || typeof artifact?.screenshots !== "object" || Array.isArray(artifact.screenshots)) {
    return {
      exists: true,
      ok: false,
      detail: "schemaVersion, generatedAt, or screenshots is invalid",
      screenshots: {},
    };
  }

  return {
    exists: true,
    ok: true,
    detail: "screenshot-proofs.json ready",
    screenshots: artifact.screenshots,
  };
}

function expectedScreenshotProofEntry(item, index, absolute, screenshot) {
  const stat = fs.statSync(absolute);
  const bytes = fs.readFileSync(absolute);
  return {
    manifestIndex: index + 1,
    label: item.label,
    expectedEvidenceHash: sha256Hex(item.expectedEvidence),
    fileSha256: sha256Hex(bytes),
    byteSize: stat.size,
    width: screenshot.width,
    height: screenshot.height,
    fileModifiedAt: new Date(stat.mtimeMs).toISOString(),
  };
}

function compareScreenshotProofEntry(entry, expected) {
  const keys = Object.keys(expected);
  const actualKeys = Object.keys(entry ?? {});
  if (actualKeys.length !== keys.length || keys.some((key, index) => key !== actualKeys[index])) {
    return `proof keys mismatch; expected ${keys.join(", ")}`;
  }

  for (const key of keys) {
    if (entry[key] !== expected[key]) {
      return `${key} mismatch`;
    }
  }

  const modifiedAtMs = Date.parse(expected.fileModifiedAt);
  if (installEvidenceInstalledAtMs !== null && Number.isFinite(modifiedAtMs) && modifiedAtMs < installEvidenceInstalledAtMs) {
    return "fileModifiedAt predates install summary";
  }

  return "";
}

function validateScreenshotProofEntry(item, index, absolute, screenshot, proofArtifact, nextProofs) {
  const expected = expectedScreenshotProofEntry(item, index, absolute, screenshot);
  if (!localOnly) {
    nextProofs[item.filename] = expected;
  }

  if (!proofArtifact.ok) {
    return {
      ok: false,
      detail: proofArtifact.detail,
    };
  }

  const entry = proofArtifact.screenshots[item.filename];
  if (!entry) {
    return {
      ok: false,
      detail: "missing screenshot-proofs.json entry",
    };
  }

  const mismatch = compareScreenshotProofEntry(entry, expected);
  if (mismatch) {
    return {
      ok: false,
      detail: mismatch,
    };
  }

  return {
    ok: true,
    detail: "proof sidecar matches screenshot fingerprint",
  };
}

function writeScreenshotProofs(entries) {
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    screenshots: entries,
  };

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(screenshotProofsPath, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
}

function checkScreenshotEvidence() {
  const expected = readScreenshotManifest();
  screenshotSummary.requiredCount = expected.length;
  const proofArtifact = readScreenshotProofs();
  const nextProofs = {};

  if (!fs.existsSync(evidenceDir)) {
    warn("Screenshot evidence folder", "outputs/device-evidence is missing", "Create it when capturing real-device screenshots.");
  } else {
    pass("Screenshot evidence folder", "outputs/device-evidence present");
  }

  if (proofArtifact.exists && proofArtifact.ok) {
    pass("Screenshot proof sidecar", "screenshot-proofs.json present");
  } else if (proofArtifact.exists) {
    recordScreenshotProofIssue("Screenshot proof sidecar", "screenshot-proofs.json is invalid", proofArtifact.detail);
  }

  for (const [index, item] of expected.entries()) {
    const file = item.filename;
    const label = item.label;
    const absolute = path.join(evidenceDir, file);
    if (fs.existsSync(absolute)) {
      const screenshot = validatePngScreenshot(absolute);
      if (localOnly) {
        if (screenshot.ok) {
          screenshotSummary.presentCount += 1;
          warn(label, `${file} present (${screenshot.width}x${screenshot.height}); strict proof binding skipped in local-only mode`, "Run npm run device:evidence after real iPhone capture to bind screenshots.");
        } else {
          screenshotSummary.missingOrInvalidCount += 1;
          if (isApprovalScreenshot(item)) {
            screenshotSummary.approvalMissingOrInvalidCount += 1;
          }
          warn(label, `${file} is not usable proof`, screenshot.detail);
        }
        continue;
      }
      if (screenshot.ok) {
        const proof = validateScreenshotProofEntry(item, index, absolute, screenshot, proofArtifact, nextProofs);
        if (proof.ok) {
          screenshotSummary.presentCount += 1;
          pass(label, `${file} present (${screenshot.width}x${screenshot.height}); proof sidecar matched`);
        } else {
          screenshotSummary.missingOrInvalidCount += 1;
          if (isApprovalScreenshot(item)) {
            screenshotSummary.approvalMissingOrInvalidCount += 1;
          }
          recordScreenshotProofIssue(label, `${file} is not bound proof`, `${proof.detail}. Run npm run device:evidence again after replacing screenshots.`);
        }
      } else {
        screenshotSummary.missingOrInvalidCount += 1;
        if (isApprovalScreenshot(item)) {
          screenshotSummary.approvalMissingOrInvalidCount += 1;
        }
        recordScreenshotProofIssue(label, `${file} is not usable proof`, screenshot.detail);
      }
    } else {
      screenshotSummary.missingOrInvalidCount += 1;
      if (isApprovalScreenshot(item)) {
        screenshotSummary.approvalMissingOrInvalidCount += 1;
      }
      warn(label, `${file} missing`, item.expectedEvidence ?? "Manual screenshot proof still needed after the iPhone run.");
    }
  }

  if (!localOnly) {
    writeScreenshotProofs(nextProofs);
  }
}

function validatePngScreenshot(file) {
  let header;
  try {
    header = fs.readFileSync(file).subarray(0, 33);
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (header.length < 24 || !pngSignature.every((byte, index) => header[index] === byte)) {
    return { ok: false, detail: "Expected a PNG screenshot file." };
  }

  if (header.readUInt32BE(8) !== 13 || header.toString("ascii", 12, 16) !== "IHDR") {
    return { ok: false, detail: "PNG header is missing a valid IHDR chunk." };
  }

  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width < 300 || height < 180) {
    return {
      ok: false,
      width,
      height,
      detail: "Screenshot is too small to prove real iPhone/widget behavior.",
    };
  }

  return { ok: true, width, height };
}

function readScreenshotManifest() {
  const manifestPath = path.join(evidenceDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    fail("Screenshot manifest", "manifest.json missing", "Restore outputs/device-evidence/manifest.json before device QA.");
    return [];
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail("Screenshot manifest", "manifest.json is not valid JSON", error instanceof Error ? error.message : String(error));
    return [];
  }

  const screenshots = manifest?.requiredScreenshots;
  if (manifest?.schemaVersion !== 1 || !Array.isArray(screenshots) || screenshots.length === 0) {
    fail("Screenshot manifest", "schemaVersion or requiredScreenshots is invalid", "Use schemaVersion 1 with a non-empty requiredScreenshots array.");
    return [];
  }

  const filenames = new Set();
  const invalid = [];
  for (const [index, item] of screenshots.entries()) {
    const filename = item?.filename;
    const label = item?.label;
    const expectedEvidence = item?.expectedEvidence;
    if (
      typeof filename !== "string" ||
      !/^[0-9]{2}-[a-z0-9-]+\.png$/.test(filename) ||
      filenames.has(filename) ||
      typeof label !== "string" ||
      label.length === 0 ||
      label.length > 80 ||
      typeof expectedEvidence !== "string" ||
      expectedEvidence.length === 0 ||
      expectedEvidence.length > 180
    ) {
      invalid.push(index + 1);
    }
    filenames.add(filename);
  }

  if (invalid.length > 0) {
    fail("Screenshot manifest", `invalid screenshot entries: ${invalid.join(", ")}`, "Keep filenames stable and expected evidence short.");
    return [];
  }

  pass("Screenshot manifest", `${screenshots.length} required screenshots listed`);
  screenshotSummary.manifestReady = true;
  return screenshots;
}

function writeEvidenceSummary(failed, warned) {
  const status = failed > 0 ? "blocked" : "ready";
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: localOnly ? "local-only" : "strict",
    status,
    passCount: rows.length - failed - warned,
    warningCount: warned,
    failureCount: failed,
    installEvidenceReady,
    screenshotManifestReady: screenshotSummary.manifestReady,
    screenshotProofRequiredCount: screenshotSummary.requiredCount,
    screenshotProofPresentCount: screenshotSummary.presentCount,
    screenshotProofMissingOrInvalidCount: screenshotSummary.missingOrInvalidCount,
    approvalScreenshotProofMissingOrInvalidCount: screenshotSummary.approvalMissingOrInvalidCount,
    approvalQaScriptsPresent: approvalQaScriptsPresent(),
    failedChecks: rows.filter((row) => row.status === "FAIL").map((row) => row.name),
    warningChecks: rows.filter((row) => row.status === "WARN").map((row) => row.name),
  };

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(evidenceSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  console.log(`Evidence summary: ${path.relative(repoRoot, evidenceSummaryPath)}`);
}

function checkPostInstallScreenshotGate() {
  if (!postInstallScreenshotGateBlocked({
    localOnly,
    installEvidenceReady,
    screenshotProofMissingOrInvalidCount: screenshotSummary.missingOrInvalidCount,
  })) {
    return;
  }

  fail(
    "Post-install screenshot proof",
    `${screenshotSummary.missingOrInvalidCount} required screenshot(s) missing or not sidecar-bound`,
    "Capture every manifest screenshot, run npm run device:evidence once to write screenshot-proofs.json, then run it again to prove the fingerprints."
  );
}

console.log(`AI Usage Widget device evidence${localOnly ? " (--local-only)" : ""}\n`);
if (localOnly) {
  console.log("LOCAL EVIDENCE ONLY: no signed install, no iPhone install proof, no WidgetKit screenshot proof.\n");
}
const localConfig = checkSigningEvidence();
checkProjectEvidence(localConfig);
checkBuildProducts();
await checkConnectorEvidence();
checkInstallEvidence();
checkScreenshotEvidence();
checkPostInstallScreenshotGate();

const width = Math.max(...rows.map((row) => row.name.length), 1);
for (const row of rows) {
  console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  if (row.hint) {
    console.log(`     -> ${row.hint}`);
  }
}

const failed = rows.filter((row) => row.status === "FAIL").length;
const warned = rows.filter((row) => row.status === "WARN").length;
if (screenshotSummary.approvalMissingOrInvalidCount > 0 && !localOnly) {
  printApprovalQaCommands();
} else if (screenshotSummary.approvalMissingOrInvalidCount > 0) {
  console.log("\nPhone approval screenshots are expected to remain missing in local-only mode.");
}
console.log(`\n${rows.length - failed - warned} passed, ${warned} warnings, ${failed} failures`);
writeEvidenceSummary(failed, warned);

if (failed > 0) {
  process.exitCode = 1;
}
