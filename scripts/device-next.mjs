import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { collectDevicectlPhysicalIphones, parseXctracePhysicalIphones } from "./lib/device-discovery.mjs";
import { iphoneosBuildFreshness } from "./lib/ios-build-freshness.mjs";

const repoRoot = process.cwd();
const require = createRequire(import.meta.url);
const appPath = path.join(repoRoot, "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app");
const widgetPath = path.join(appPath, "PlugIns", "AIUsageWidgetExtension.appex");
const evidenceDir = path.join(repoRoot, "outputs/device-evidence");
const readinessPath = path.join(evidenceDir, "00-device-readiness.json");
const installSummaryPath = path.join(evidenceDir, "00-install-summary.json");
const screenshotManifestPath = path.join(evidenceDir, "manifest.json");
const screenshotProofsPath = path.join(evidenceDir, "screenshot-proofs.json");
let snapshotParser;

function parseXcconfig(relativePath) {
  const file = path.join(repoRoot, relativePath);
  const values = {};
  if (!fs.existsSync(file)) {
    return values;
  }

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    values[key.trim()] = rest.join("=").trim();
  }
  return values;
}

function run(command, args, timeout = 20_000) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    maxBuffer: 1024 * 1024,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
    signal: result.signal,
  };
}

function commandText(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function firstUsefulLine(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function summarize(result) {
  if (result.error) {
    return result.error.message;
  }
  if (result.signal) {
    return `terminated by ${result.signal}`;
  }
  return firstUsefulLine(result.stderr) || firstUsefulLine(result.stdout) || `exit ${result.status}`;
}

function parseTeamIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/\(([A-Z0-9]{10})\)/g)) {
    ids.add(match[1]);
  }
  return [...ids].sort();
}

function xcodeProvisioningTeamIds() {
  const plist = path.join(os.homedir(), "Library", "Preferences", "com.apple.dt.Xcode.plist");
  if (!fs.existsSync(plist)) {
    return [];
  }

  const result = run("plutil", ["-p", plist], 15_000);
  if (result.status !== 0) {
    return [];
  }

  return [...new Set([...commandText(result).matchAll(/"teamID"\s*=>\s*"([A-Z0-9]{10})"/g)].map((match) => match[1]))].sort();
}

function appleDevelopmentIdentitySummary() {
  const result = run("security", ["find-identity", "-v", "-p", "codesigning"]);
  if (result.status !== 0) {
    return { ok: false, teamIds: [], detail: summarize(result) };
  }

  const appleDevelopmentLines = commandText(result)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /Apple Development/i.test(line));

  return {
    ok: appleDevelopmentLines.length > 0,
    teamIds: parseTeamIds(appleDevelopmentLines.join("\n")),
    detail: appleDevelopmentLines.length > 0 ? `${appleDevelopmentLines.length} found` : "0 valid identities found",
  };
}

function iphoneVisible() {
  const xctrace = run("xcrun", ["xctrace", "list", "devices"], 30_000);
  const output = commandText(xctrace);
  if (xctrace.status !== 0 || /No devices available/i.test(output)) {
    return { ok: false, detail: summarize(xctrace) };
  }
  const physicalIphones = parseXctracePhysicalIphones(output);
  if (physicalIphones.length > 0) {
    return { ok: true, detail: `${physicalIphones.length} physical iPhone${physicalIphones.length === 1 ? "" : "s"} visible` };
  }
  return { ok: false, detail: "xctrace ran, no physical iPhone listed" };
}

function coreDeviceVisible() {
  const devicectlJson = path.join(os.tmpdir(), `aiuw-device-next-devices-${process.pid}.json`);
  try {
    fs.unlinkSync(devicectlJson);
  } catch {
    // Best-effort cleanup; stale temp files do not affect readiness.
  }

  const devicectl = run("xcrun", [
    "devicectl",
    "list",
    "devices",
    "--timeout",
    "20",
    "--json-output",
    devicectlJson,
  ], 30_000);
  if (devicectl.status !== 0 || !fs.existsSync(devicectlJson)) {
    try {
      fs.unlinkSync(devicectlJson);
    } catch {
      // Best-effort cleanup only.
    }
    return { ok: false, detail: summarize(devicectl) };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(devicectlJson, "utf8"));
    const physicalIphones = collectDevicectlPhysicalIphones(parsed);
    if (physicalIphones.length > 0) {
      return { ok: true, detail: "listed by devicectl" };
    }
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  } finally {
    try {
      fs.unlinkSync(devicectlJson);
    } catch {
      // The temp file contains device names only; cleanup remains best-effort.
    }
  }

  return { ok: false, detail: "devicectl ran, no iPhone listed" };
}

function verifyCodeSignature(bundlePath) {
  if (!fs.existsSync(bundlePath)) {
    return false;
  }
  return run("codesign", ["--verify", "--strict", bundlePath], 10_000).status === 0;
}

function sha256Hex(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function signedEntitlements(bundlePath) {
  if (!fs.existsSync(bundlePath)) {
    return "";
  }
  const result = run("codesign", ["-d", "--entitlements", ":-", bundlePath], 10_000);
  return result.status === 0 ? commandText(result) : "";
}

function installableProduct(config) {
  if (!fs.existsSync(appPath) || !fs.existsSync(widgetPath)) {
    return { ok: false, detail: "iphoneos app/widget build product missing" };
  }

  const issues = [];
  if (!verifyCodeSignature(appPath)) {
    issues.push("app unsigned");
  }
  if (!verifyCodeSignature(widgetPath)) {
    issues.push("widget unsigned");
  }
  if (!fs.existsSync(path.join(appPath, "embedded.mobileprovision"))) {
    issues.push("embedded.mobileprovision missing");
  }
  if (config.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    if (!signedEntitlements(appPath).includes(config.APP_GROUP_IDENTIFIER)) {
      issues.push("app App Group entitlement missing");
    }
    if (!signedEntitlements(widgetPath).includes(config.APP_GROUP_IDENTIFIER)) {
      issues.push("widget App Group entitlement missing");
    }
  } else {
    issues.push("APP_GROUP_IDENTIFIER missing");
  }

  return {
    ok: issues.length === 0,
    detail: issues.length === 0 ? "signed/provisioned app and widget found" : issues.join("; "),
  };
}

function readScreenshotManifest() {
  if (!fs.existsSync(screenshotManifestPath)) {
    return { ok: false, detail: "outputs/device-evidence/manifest.json is missing", screenshots: [] };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(screenshotManifestPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      screenshots: [],
    };
  }

  const screenshots = manifest?.requiredScreenshots;
  if (manifest?.schemaVersion !== 1 || !Array.isArray(screenshots) || screenshots.length === 0) {
    return { ok: false, detail: "manifest schemaVersion or requiredScreenshots is invalid", screenshots: [] };
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
    return { ok: false, detail: `invalid screenshot manifest entries: ${invalid.join(", ")}`, screenshots: [] };
  }

  return { ok: true, detail: `${screenshots.length} required screenshots listed`, screenshots };
}

function screenshotIssues(screenshots) {
  const proofArtifact = readScreenshotProofs();
  const installedAtMs = installSummaryInstalledAtMs();
  return screenshots
    .map((item, index) => ({
      ...item,
      screenshotStatus: validateScreenshotProof(item, index, proofArtifact, installedAtMs),
    }))
    .filter((item) => !item.screenshotStatus.ok);
}

function readScreenshotProofs() {
  if (!fs.existsSync(screenshotProofsPath)) {
    return {
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
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      screenshots: {},
    };
  }

  if (artifact?.schemaVersion !== 1 || typeof artifact?.generatedAt !== "string" || Number.isNaN(Date.parse(artifact.generatedAt)) || artifact?.screenshots === null || typeof artifact?.screenshots !== "object" || Array.isArray(artifact.screenshots)) {
    return {
      ok: false,
      detail: "screenshot-proofs.json schema is invalid",
      screenshots: {},
    };
  }

  return {
    ok: true,
    detail: "screenshot-proofs.json ready",
    screenshots: artifact.screenshots,
  };
}

function validateScreenshotProof(item, index, proofArtifact, installedAtMs) {
  const absolute = path.join(evidenceDir, item.filename);
  const screenshot = validatePngScreenshot(absolute);
  if (!screenshot.ok) {
    return screenshot;
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

  const expected = expectedScreenshotProofEntry(item, index, absolute, screenshot);
  const mismatch = compareScreenshotProofEntry(entry, expected, installedAtMs);
  if (mismatch) {
    return {
      ok: false,
      detail: mismatch,
    };
  }

  return {
    ok: true,
    detail: `${screenshot.width}x${screenshot.height}; proof sidecar matched`,
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

function compareScreenshotProofEntry(entry, expected, installedAtMs) {
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
  if (installedAtMs !== null && Number.isFinite(modifiedAtMs) && modifiedAtMs < installedAtMs) {
    return "fileModifiedAt predates install summary";
  }

  return "";
}

function validatePngScreenshot(file) {
  if (!fs.existsSync(file)) {
    return { ok: false, detail: "missing" };
  }

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
    return { ok: false, detail: "not a PNG screenshot" };
  }

  if (header.readUInt32BE(8) !== 13 || header.toString("ascii", 12, 16) !== "IHDR") {
    return { ok: false, detail: "invalid PNG header" };
  }

  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width < 300 || height < 180) {
    return { ok: false, detail: `too small (${width}x${height})` };
  }

  return { ok: true, detail: `${width}x${height}` };
}

function installSummaryInstalledAtMs() {
  if (!fs.existsSync(installSummaryPath)) {
    return null;
  }

  try {
    const summary = JSON.parse(fs.readFileSync(installSummaryPath, "utf8"));
    const installedAtMs = Date.parse(summary?.installedAt ?? "");
    return Number.isFinite(installedAtMs) ? installedAtMs : null;
  } catch {
    return null;
  }
}

function installEvidenceReady() {
  if (!fs.existsSync(installSummaryPath)) {
    return false;
  }
  try {
    const summary = JSON.parse(fs.readFileSync(installSummaryPath, "utf8"));
    return summary?.schemaVersion === 1 &&
      summary?.status === "success" &&
      summary?.devicectlExitStatus === 0 &&
      summary?.appSigned === true &&
      summary?.widgetSigned === true &&
      summary?.embeddedMobileprovision === true &&
      summary?.appGroupInAppEntitlements === true &&
      summary?.appGroupInWidgetEntitlements === true;
  } catch {
    return false;
  }
}

function fileMode(absolutePath) {
  return fs.statSync(absolutePath).mode & 0o777;
}

function connectorConfigPermissionsReady(configDir, configPath) {
  try {
    const dirMode = fileMode(configDir);
    const fileModeValue = fileMode(configPath);
    return (dirMode & 0o077) === 0 && (fileModeValue & 0o177) === 0;
  } catch {
    return false;
  }
}

async function connectorPairingReady() {
  const configDir = process.env.AIUW_CONFIG_DIR ?? path.join(os.homedir(), ".aiuw");
  const configPath = path.join(configDir, "config.json");
  if (!fs.existsSync(configPath)) {
    return { ok: false, detail: "pairing config is missing" };
  }
  if (!connectorConfigPermissionsReady(configDir, configPath)) {
    return { ok: false, detail: "pairing config permissions are too broad" };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {
      ok: false,
      detail: "pairing config is unreadable"
    };
  }

  if (config?.version !== 1 || !config.deviceId || !config.name || !config.token) {
    return { ok: false, detail: "pairing config shape is invalid" };
  }

  const networkModulePath = path.join(repoRoot, "connector/dist/connector/src/network.js");
  if (!fs.existsSync(networkModulePath)) {
    return { ok: false, detail: "connector build output is missing; run npm run build:connector" };
  }

  try {
    const network = await import(pathToFileURL(networkModulePath).href);
    const hosts = network.getLanHosts();
    let readyCount = 0;
    for (const host of hosts) {
      if (await connectorHostReady(host, 8787, config.token)) {
        readyCount += 1;
      }
    }
    if (readyCount > 0) {
      return { ok: true, detail: `${readyCount} advertised address(es) served ping and snapshot` };
    }
    return {
      ok: false,
      detail: "pairing config exists, but no advertised host answered both /v1/ping and /v1/snapshot"
    };
  } catch {
    return {
      ok: false,
      detail: "connector pairing probe unavailable"
    };
  }
}

async function connectorHostReady(host, port, token) {
  try {
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
    const pingBody = await pingResponse.json();
    if (pingBody?.ok !== true) {
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
  } catch {
    return false;
  }
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

function printCommands(commands) {
  for (const command of commands) {
    console.log(`  ${command}`);
  }
}

function printUsefulWhileBlocked() {
  console.log("\nUseful while blocked (in order):");
  printCommands(["npm run device:preflight:local", "npm run device:build:unsigned", "npm run device:evidence:local", "npm run device:evidence"]);
  console.log("  device:preflight:local is the no-signing readiness gate; keep it green while Apple signing/device access is blocked.");
  console.log("  device:evidence:local confirms local source/build proof while signing is blocked; strict device:evidence remains the post-install gate.");
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

function approvalQaScriptsPresent() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    return Boolean(
      packageJson.scripts?.["connector:approvals:seed"]?.includes("approvals seed") &&
        packageJson.scripts?.["connector:approvals"]?.includes("approvals") &&
        packageJson.scripts?.["connector:approvals:clear"]?.includes("approvals clear")
    );
  } catch {
    return false;
  }
}

function runLocalPreflight() {
  const result = run(process.execPath, ["scripts/device-preflight.mjs", "--local-only"], 90_000);
  const text = commandText(result);
  const summaryMatch = text.match(/(\d+) passed, (\d+) warnings?, (\d+) failures?/i);
  const passed = summaryMatch ? Number(summaryMatch[1]) : 0;
  const warnings = summaryMatch ? Number(summaryMatch[2]) : 0;
  const failures = summaryMatch ? Number(summaryMatch[3]) : 1;

  return {
    ready: result.status === 0 && failures === 0,
    passed,
    warnings,
    failures,
  };
}

function writeReadinessEvidence(nextGate, status = "blocked") {
  const xcodeDeviceReady = configReady && signingReady && !teamMismatch && device.ok;
  const coreDeviceReady = xcodeDeviceReady && coreDevice.ok;
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    nextGate,
    localPreflightReady: localPreflight.ready,
    localPreflightWarnings: localPreflight.warnings,
    localPreflightFailures: localPreflight.failures,
    configReady,
    signingReady,
    teamMismatch,
    xcodeDeviceVisible: xcodeDeviceReady,
    coreDeviceVisible: coreDeviceReady,
    unsignedIphoneosBuildPresent: unsignedBuild.present,
    unsignedIphoneosBuildFresh: unsignedBuild.fresh,
    signedInstallableProductReady: product.ok,
    installSummaryPresent: fs.existsSync(installSummaryPath),
    installSummaryReady: installReady,
    pairingReady: pairingReady.ok,
    screenshotManifestReady: screenshotManifest.ok,
    screenshotManifestCount: screenshotManifest.screenshots.length,
    screenshotProofMissingOrInvalidCount: screenshots.length,
    approvalScreenshotProofMissingOrInvalidCount: screenshots.filter(isApprovalScreenshot).length,
    approvalQaScriptsPresent: approvalQaScriptsPresent(),
  };

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(readinessPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  console.log(`\nReadiness evidence: ${path.relative(repoRoot, readinessPath)}`);
}

const config = parseXcconfig("ios/Config/Local.xcconfig");
const missingConfigFields = [
  ["DEVELOPMENT_TEAM", config.DEVELOPMENT_TEAM],
  ["PRODUCT_BUNDLE_IDENTIFIER_PREFIX", config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX],
  ["APP_GROUP_IDENTIFIER", config.APP_GROUP_IDENTIFIER?.startsWith("group.") ? config.APP_GROUP_IDENTIFIER : ""],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
const configReady = Boolean(
  config.DEVELOPMENT_TEAM &&
    config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX &&
    config.APP_GROUP_IDENTIFIER?.startsWith("group.")
);
const signing = appleDevelopmentIdentitySummary();
const xcodeTeamIds = xcodeProvisioningTeamIds();
const signingReady = signing.ok;
const teamMismatch = Boolean(
  config.DEVELOPMENT_TEAM &&
    signingReady &&
    signing.teamIds.length > 0 &&
    !signing.teamIds.includes(config.DEVELOPMENT_TEAM) &&
    !xcodeTeamIds.includes(config.DEVELOPMENT_TEAM)
);
const device = iphoneVisible();
const coreDevice = coreDeviceVisible();
const product = installableProduct(config);
const unsignedBuild = iphoneosBuildFreshness(repoRoot);
const installReady = installEvidenceReady();
const pairingReady = await connectorPairingReady();
const screenshotManifest = readScreenshotManifest();
const screenshots = screenshotIssues(screenshotManifest.screenshots);
const localPreflight = runLocalPreflight();

console.log("AI Usage Widget next device gate\n");

if (!configReady) {
  if (!config.DEVELOPMENT_TEAM && !signingReady) {
    console.log("Next gate: sign into Xcode and create an Apple Development identity");
    console.log("Why: Local.xcconfig is missing DEVELOPMENT_TEAM, and this Mac has no usable Apple Development certificate to infer it from.");
    console.log("\nDo next:");
    console.log("  1. Open Xcode Settings > Accounts and sign in.");
    console.log("  2. Select your team, manage certificates, and create/download an Apple Development certificate.");
    console.log("  3. If Xcode creates exactly one Apple Development identity, run npm run device:signing:apply.");
    console.log("     If multiple teams are present, run npm run device:signing:apply -- --team TEAMID.");
    console.log("\nThen run:");
    printCommands(["npm run device:signing:apply", "npm run device:signing"]);
    printUsefulWhileBlocked();
    writeReadinessEvidence("apple-development-signing");
    process.exit(0);
  }

  console.log("Next gate: fill local signing config");
  console.log(`Why: ${missingConfigFields.join(", ")} ${missingConfigFields.length === 1 ? "is" : "are"} missing or malformed.`);
  console.log("\nRun next:");
  printCommands(["npm run device:signing:apply", "npm run device:signing"]);
  console.log("\nThen confirm PRODUCT_BUNDLE_IDENTIFIER_PREFIX and APP_GROUP_IDENTIFIER in ios/Config/Local.xcconfig.");
  printUsefulWhileBlocked();
  writeReadinessEvidence("local-signing-config");
  process.exit(0);
}

if (!signingReady) {
  console.log("Next gate: create or download an Apple Development signing identity");
  console.log("Why: Local.xcconfig is filled, but this Mac has no usable Apple Development certificate.");
  console.log("\nRun next:");
  printCommands(["npm run device:signing"]);
  console.log("\nOpen Xcode Settings > Accounts, sign in, select the team, and manage certificates.");
  printUsefulWhileBlocked();
  writeReadinessEvidence("apple-development-identity");
  process.exit(0);
}

if (teamMismatch) {
  console.log("Next gate: fix DEVELOPMENT_TEAM mismatch");
  console.log("Why: Local.xcconfig does not match a local Apple Development identity.");
  console.log("\nRun next:");
  printCommands(["npm run device:signing", "npm run device:signing:apply -- --team TEAMID --force"]);
  console.log("\nThen choose the intended Apple Development certificate in Xcode or intentionally replace DEVELOPMENT_TEAM with the helper.");
  printUsefulWhileBlocked();
  writeReadinessEvidence("development-team-mismatch");
  process.exit(0);
}

if (!device.ok) {
  console.log("Next gate: make the iPhone visible to Xcode");
  console.log(`Why: ${device.detail}`);
  console.log("\nRun next:");
  printCommands(["npm run device:signing", "npm run device:preflight"]);
  console.log("\nUnlock the iPhone, tap Trust, and confirm it appears in Xcode Devices.");
  printUsefulWhileBlocked();
  writeReadinessEvidence("xcode-device-visibility");
  process.exit(0);
}

if (!coreDevice.ok) {
  console.log("Next gate: make the iPhone visible to CoreDevice");
  console.log(`Why: ${coreDevice.detail}`);
  console.log("\nRun next:");
  printCommands(["npm run device:signing", "npm run device:preflight"]);
  console.log("\nXcode may still install manually if CoreDevice CLI is flaky, but command-line install evidence requires devicectl.");
  printUsefulWhileBlocked();
  writeReadinessEvidence("coredevice-visibility");
  process.exit(0);
}

if (!product.ok) {
  console.log("Next gate: build a signed installable iPhone product");
  console.log(`Why: ${product.detail}`);
  console.log("\nRun next:");
  printCommands(["npm run device:build", "npm run device:install"]);
  writeReadinessEvidence("signed-iphoneos-build");
  process.exit(0);
}

if (!installReady) {
  console.log("Next gate: install the signed app on the iPhone");
  console.log("Why: the signed product is ready or pending, but outputs/device-evidence/00-install-summary.json does not prove a successful install yet.");
  console.log("\nRun next:");
  printCommands(["npm run device:install"]);
  console.log("\nIf command-line CoreDevice is unreliable, install from Xcode and keep going with screenshots, but device:evidence will still warn until command-line install evidence exists.");
  writeReadinessEvidence("device-install");
  process.exit(0);
}

if (!pairingReady.ok) {
  console.log("Next gate: start and pair the Mac connector");
  console.log(`Why: signed app proof can run, but ${pairingReady.detail}.`);
  console.log("\nRun next:");
  printCommands([
    "npm run start:mock",
    "npm run connector:status:live",
    "npm run pair:manual",
  ]);
  console.log("\nScan the QR normally, or paste the manual payload if scanner fallback is needed.");
  writeReadinessEvidence("mac-connector-pairing");
  process.exit(0);
}

if (!screenshotManifest.ok) {
  console.log("Next gate: repair the device screenshot manifest");
  console.log(`Why: ${screenshotManifest.detail}.`);
  console.log("\nRun next:");
  printCommands(["npm run device:evidence"]);
  writeReadinessEvidence("screenshot-manifest");
  process.exit(0);
}

if (screenshots.length > 0) {
  console.log("Next gate: capture real iPhone evidence screenshots");
  console.log(`Why: ${screenshots.length} screenshot(s) are missing or not usable PNG proof in outputs/device-evidence.`);
  console.log("\nMissing or invalid:");
  for (const item of screenshots) {
    console.log(`  ${item.filename} (${item.screenshotStatus.detail}) - ${item.expectedEvidence}`);
  }
  if (screenshots.some(isApprovalScreenshot)) {
    printApprovalQaCommands();
  }
  console.log("\nRun next after capturing them:");
  printCommands(["npm run device:evidence"]);
  writeReadinessEvidence("iphone-screenshots");
  process.exit(0);
}

console.log("Next gate: run final device evidence audit");
console.log("Why: signing, installability, pairing config, and manifest screenshot filenames are present locally.");
console.log("\nRun next:");
printCommands(["npm run device:evidence"]);
writeReadinessEvidence("final-device-evidence", "ready");
