import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  collectDevicectlPhysicalIphones,
  parseXctracePhysicalIphones,
  uniqueDevices,
} from "./lib/device-discovery.mjs";

const repoRoot = process.cwd();
const derivedDataPath = path.join(repoRoot, "build", "DerivedData");
const appPath = path.join(
  derivedDataPath,
  "Build",
  "Products",
  "Debug-iphoneos",
  "AIUsageWidgetApp.app"
);
const evidenceDir = path.join(repoRoot, "outputs", "device-evidence");
const installSummaryPath = path.join(evidenceDir, "00-install-summary.json");
const buildLogPath = path.join(repoRoot, "build", "device-build.log");

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const parsed = {
    device: undefined,
    skipBuild: false,
    install: false,
    allowProvisioningUpdates: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--device") {
      parsed.device = argv[index + 1];
      index += 1;
    } else if (arg === "--install") {
      parsed.install = true;
    } else if (arg === "--skip-build") {
      parsed.skipBuild = true;
    } else if (arg === "--allow-provisioning-updates") {
      parsed.allowProvisioningUpdates = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage:
  npm run device:build
  npm run device:install
  npm run device:install -- --device "Kai's iPhone"
  npm run device:install -- --skip-build
  npm run device:install -- --allow-provisioning-updates
  node scripts/device-install.mjs
  node scripts/device-install.mjs --install

Builds AIUsageWidgetApp for a physical iPhone. --install also installs it with devicectl.
Running this file directly without --install, or npm run device:build, performs build/check only.
It does not start the connector, rotate pairing tokens, or change LaunchAgent state.
`);
}

function fail(message, hint) {
  console.error(`ERROR ${message}`);
  if (hint) {
    console.error(`      ${hint}`);
  }
  process.exit(1);
}

function firstUsefulLine(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function summarizeResult(result) {
  let detail;
  if (result.error) {
    detail = result.error.message;
  } else if (result.signal) {
    detail = `terminated by ${result.signal}`;
  } else {
    detail = firstUsefulLine(result.stderr) || firstUsefulLine(result.stdout) || `exit ${result.status}`;
  }
  return stripLocalPaths(redactDeviceSelectors(detail));
}

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
    stdio: options.stdio ?? "pipe",
  });
}

function parseXcconfig(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    return {};
  }

  const values = {};
  for (const line of fs.readFileSync(absolute, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//") || !trimmed.includes("=")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    values[key.trim()] = rest.join("=").trim();
  }
  return values;
}

function assertPrerequisites() {
  const localConfig = parseXcconfig("ios/Config/Local.xcconfig");
  if (!localConfig.DEVELOPMENT_TEAM) {
    fail(
      "DEVELOPMENT_TEAM is empty in ios/Config/Local.xcconfig",
      "Fill the Personal Team ID in Xcode before running device install."
    );
  }

  if (!localConfig.PRODUCT_BUNDLE_IDENTIFIER_PREFIX || !localConfig.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    fail(
      "Bundle prefix or App Group identifier is missing",
      "Fill PRODUCT_BUNDLE_IDENTIFIER_PREFIX and APP_GROUP_IDENTIFIER before device install."
    );
  }

  if (!fs.existsSync(path.join(repoRoot, "ios", "AIUsageWidget.xcodeproj", "project.pbxproj"))) {
    fail("Generated Xcode project is missing", "Run npm run generate:ios first.");
  }
}

function ensureBuildDir() {
  fs.mkdirSync(path.join(repoRoot, "build"), { recursive: true });
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function findDeviceSelector() {
  if (args.device) {
    return args.device;
  }

  ensureBuildDir();
  const devicesJson = path.join(repoRoot, "build", "devicectl-devices.json");
  const devicesLog = path.join(repoRoot, "build", "devicectl-devices.log");
  const devicectlList = run(
    "xcrun",
    ["devicectl", "list", "devices", "--timeout", "20", "--json-output", devicesJson, "--log-output", devicesLog],
    { timeout: 30_000 }
  );
  if (devicectlList.status === 0) {
    const devices = uniqueDevices(collectDevicectlPhysicalIphones(readJsonFile(devicesJson)));
    if (devices.length === 1) {
      console.log("Using iPhone: physical iPhone 1");
      return devices[0].selector;
    }
    if (devices.length > 1) {
      console.log("Multiple iPhones found by devicectl:");
      for (const [index, device] of devices.entries()) {
        console.log(`  ${index + 1}. physical iPhone (${redactedSelector(device.selector)})`);
      }
      fail("Pass --device with the iPhone identifier or exact name.");
    }
  }

  const xctrace = run("xcrun", ["xctrace", "list", "devices"], { timeout: 20_000 });
  const devices = xctrace.status === 0 ? parseXctracePhysicalIphones(xctrace.stdout) : [];
  if (devices.length === 1) {
    const device = devices[0];
    console.log("Using iPhone: physical iPhone 1");
    return device.selector;
  }

  if (devices.length > 1) {
    console.log("Multiple iPhones found:");
    for (const [index, device] of devices.entries()) {
      console.log(`  ${index + 1}. physical iPhone (${redactedSelector(device.selector)})`);
    }
    fail("Pass --device with the iPhone name or identifier.");
  }

  const devicectl = run("xcrun", ["devicectl", "list", "devices"], { timeout: 20_000 });
  fail(
    "No physical iPhone is visible to Xcode/CoreDevice",
    `devicectl: ${summarizeResult(devicectlList) || summarizeResult(devicectl)}; xctrace: ${summarizeResult(xctrace)}`
  );
}

function assertDeviceProductExists() {
  if (!fs.existsSync(appPath)) {
    fail("Device build product was not found", path.relative(repoRoot, appPath));
  }
  const widgetPath = path.join(appPath, "PlugIns", "AIUsageWidgetExtension.appex");
  if (!fs.existsSync(widgetPath)) {
    fail("Embedded widget extension was not found", path.relative(repoRoot, widgetPath));
  }
}

function commandText(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function verifyCodeSignature(bundlePath) {
  const result = run("codesign", ["--verify", "--strict", bundlePath], { timeout: 10_000 });
  return {
    ok: result.status === 0,
    detail: stripLocalPaths(commandText(result).trim()) || `exit ${result.status}`,
  };
}

function codesignEntitlements(bundlePath) {
  const result = run("codesign", ["-d", "--entitlements", ":-", bundlePath], {
    timeout: 10_000,
    maxBuffer: 256 * 1024,
  });
  if (result.status !== 0) {
    return "";
  }
  return commandText(result);
}

function redactedSelector(selector) {
  if (!selector) {
    return "unknown";
  }
  const value = String(selector);
  if (value.length <= 8) {
    return "redacted";
  }
  return `redacted:${value.slice(-6)}`;
}

function stripLocalPaths(text) {
  return String(text ?? "")
    .replaceAll(repoRoot, "<repo>")
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<home>");
}

function redactDeviceSelectors(text) {
  return String(text ?? "")
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{16}/g, "redacted-device")
    .replace(/\b[0-9a-fA-F]{40}\b/g, "redacted-device");
}

function writeCommandLog(file, result) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, commandText(result), { mode: 0o600 });
  return path.relative(repoRoot, file);
}

function writeInstallEvidence(result) {
  const localConfig = parseXcconfig("ios/Config/Local.xcconfig");
  const widgetPath = path.join(appPath, "PlugIns", "AIUsageWidgetExtension.appex");
  const summary = {
    schemaVersion: 1,
    installedAt: new Date().toISOString(),
    status: "success",
    tool: "xcrun devicectl device install app",
    appProduct: path.relative(repoRoot, appPath),
    widgetProduct: path.relative(repoRoot, widgetPath),
    appSigned: verifyCodeSignature(appPath).ok,
    widgetSigned: verifyCodeSignature(widgetPath).ok,
    embeddedMobileprovision: fs.existsSync(path.join(appPath, "embedded.mobileprovision")),
    appGroupIdentifier: localConfig.APP_GROUP_IDENTIFIER ?? null,
    appGroupInAppEntitlements: Boolean(
      localConfig.APP_GROUP_IDENTIFIER &&
        signedEntitlementsIncludes(appPath, localConfig.APP_GROUP_IDENTIFIER)
    ),
    appGroupInWidgetEntitlements: Boolean(
      localConfig.APP_GROUP_IDENTIFIER &&
        signedEntitlementsIncludes(widgetPath, localConfig.APP_GROUP_IDENTIFIER)
    ),
    devicectlExitStatus: result.status,
  };

  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(installSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  return installSummaryPath;
}

function signedEntitlementsIncludes(bundlePath, value) {
  return codesignEntitlements(bundlePath).includes(value);
}

function assertInstallableDeviceProduct() {
  assertDeviceProductExists();
  const localConfig = parseXcconfig("ios/Config/Local.xcconfig");
  const widgetPath = path.join(appPath, "PlugIns", "AIUsageWidgetExtension.appex");
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
  if (localConfig.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    const appEntitlements = codesignEntitlements(appPath);
    const widgetEntitlements = codesignEntitlements(widgetPath);
    if (!appEntitlements.includes(localConfig.APP_GROUP_IDENTIFIER)) {
      issues.push("app signed entitlements missing App Group");
    }
    if (!widgetEntitlements.includes(localConfig.APP_GROUP_IDENTIFIER)) {
      issues.push("widget signed entitlements missing App Group");
    }
  } else {
    issues.push("APP_GROUP_IDENTIFIER unavailable for signed entitlement check");
  }

  if (issues.length > 0) {
    fail(
      "Device product is not installable",
      `${issues.join("; ")}. Run npm run device:build after signing/provisioning is configured; npm run device:build:unsigned is compile proof only.`
    );
  }
}

function buildForDevice(deviceSelector) {
  const destination = deviceSelector ? `id=${deviceSelector}` : "generic/platform=iOS";
  const commandArgs = [
    "-project",
    "ios/AIUsageWidget.xcodeproj",
    "-scheme",
    "AIUsageWidgetApp",
    "-sdk",
    "iphoneos",
    "-configuration",
    "Debug",
    "-destination",
    destination,
    "-derivedDataPath",
    "build/DerivedData",
    "-destination-timeout",
    "30",
    "build",
  ];

  if (args.allowProvisioningUpdates) {
    commandArgs.splice(commandArgs.length - 1, 0, "-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration");
  }

  console.log("Building Debug-iphoneos app...");
  const result = run("xcodebuild", commandArgs, { timeout: 600_000, maxBuffer: 32 * 1024 * 1024 });
  const relativeLog = writeCommandLog(buildLogPath, result);
  console.log(`Build log: ${relativeLog}`);
  if (result.status !== 0) {
    fail("xcodebuild device build failed", `${summarizeResult(result)}. See ${relativeLog}.`);
  }

  assertInstallableDeviceProduct();
}

function installOnDevice(deviceSelector) {
  assertInstallableDeviceProduct();

  const tempDir = path.join(repoRoot, "build", "device-install");
  fs.mkdirSync(tempDir, { recursive: true });
  const jsonOutput = path.join(tempDir, "install.json");
  const logOutput = path.join(tempDir, "install.log");
  const commandArgs = [
    "devicectl",
    "device",
    "install",
    "app",
    "--device",
    deviceSelector,
    appPath,
    "--timeout",
    "120",
    "--json-output",
    jsonOutput,
    "--log-output",
    logOutput,
  ];

  console.log("Installing app on iPhone...");
  const result = run("xcrun", commandArgs, { timeout: 180_000 });
  if (result.status !== 0) {
    fail("devicectl install failed", summarizeResult(result));
  }

  const evidencePath = writeInstallEvidence(result);
  console.log("Installed AIUsageWidgetApp on iPhone.");
  console.log(`Install evidence summary: ${path.relative(repoRoot, evidencePath)}`);
  console.log("Next: open the app, tap 写入测试字符串, add the medium widget, then save screenshots in outputs/device-evidence.");
}

assertPrerequisites();
const deviceSelector = args.install ? findDeviceSelector() : undefined;
if (!args.skipBuild) {
  buildForDevice(deviceSelector);
} else {
  assertInstallableDeviceProduct();
}
if (args.install) {
  installOnDevice(deviceSelector);
} else {
  console.log("Device build/check completed. Install was not requested.");
  console.log("Run npm run device:install to build and install, or node scripts/device-install.mjs --install.");
}
