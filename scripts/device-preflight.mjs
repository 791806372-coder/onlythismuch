import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { collectDevicectlPhysicalIphones, parseXctracePhysicalIphones } from "./lib/device-discovery.mjs";

const repoRoot = process.cwd();
const checks = [];
const args = process.argv.slice(2);
const localOnly = args.includes("--local-only");
const unknownArgs = args.filter((arg) => arg !== "--local-only");

if (unknownArgs.length > 0) {
  console.error(`Unknown option: ${unknownArgs.join(", ")}`);
  console.error("Usage: node scripts/device-preflight.mjs [--local-only]");
  process.exit(1);
}

function record(status, name, detail, hint) {
  checks.push({ status, name, detail, hint });
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

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function readFileIfExists(relativePath) {
  return exists(relativePath) ? readFile(relativePath) : "";
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
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

function run(command, args, timeout = 20_000) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    maxBuffer: 1024 * 1024
  });

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error
  };
}

function runWithInput(command, args, input, timeout = 20_000) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    input,
    timeout,
    maxBuffer: 1024 * 1024
  });

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error
  };
}

function firstUsefulLine(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}

function summarizeCommandFailure(result) {
  if (result.error) {
    return result.error.message;
  }
  if (result.signal) {
    return `terminated by ${result.signal}`;
  }
  return firstUsefulLine(result.stderr) || firstUsefulLine(result.stdout) || `exit ${result.status}`;
}

function safeProcessOutputSummary(text) {
  const line = firstUsefulLine(text);
  if (!line) {
    return "no output";
  }
  if (/\b(?:token|bearer|authorization|manual pairing payload|pairing qr|terminal json|\{|\})\b/i.test(line)) {
    return "startup output redacted";
  }
  return line.slice(0, 160);
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "0.0.0.0", () => {
      server.close(() => resolve(true));
    });
  });
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("No open port found"));
        }
      });
    });
    server.on("error", reject);
  });
}

async function waitFor(predicate, timeoutMs, onFailure) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(onFailure());
}

async function requestJson(url, token) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(2_000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function checkSigning() {
  const localPath = "ios/Config/Local.xcconfig";
  if (!exists(localPath)) {
    fail("Local signing config", `${localPath} is missing`, "Copy ios/Config/Local.xcconfig.example and fill local values.");
    return;
  }

  const config = parseXcconfig(localPath);
  pass("Local signing config", `${localPath} exists`);

  if (config.DEVELOPMENT_TEAM) {
    pass("DEVELOPMENT_TEAM", "configured");
  } else if (localOnly) {
    warn("DEVELOPMENT_TEAM", "empty", "Skipped for --local-only; fill this from Xcode before installing on iPhone.");
  } else {
    fail("DEVELOPMENT_TEAM", "empty", "Fill this from Xcode before installing on iPhone.");
  }

  if (config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX) {
    pass("Bundle prefix", config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX);
  } else {
    fail("Bundle prefix", "empty", "Set a reverse-DNS prefix you can sign, for example com.superzhangkai.");
  }

  if (config.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    pass("App Group identifier", config.APP_GROUP_IDENTIFIER);
  } else {
    fail("App Group identifier", config.APP_GROUP_IDENTIFIER || "empty", "Use an identifier starting with group.");
  }

  if (
    config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX &&
    config.APP_GROUP_IDENTIFIER &&
    !config.APP_GROUP_IDENTIFIER.includes(config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX)
  ) {
    warn("App Group naming", `${config.APP_GROUP_IDENTIFIER} does not include ${config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX}`, "This can still work, but matching names are easier to sign and debug.");
  }
}

function checkPlistsAndEntitlements() {
  const appEntitlements = readFileIfExists("ios/AIUsageWidgetApp/AIUsageWidgetApp.entitlements");
  const widgetEntitlements = readFileIfExists("ios/AIUsageWidgetExtension/AIUsageWidgetExtension.entitlements");
  const appPlist = readFileIfExists("ios/AIUsageWidgetApp/Info.plist");
  const widgetPlist = readFileIfExists("ios/AIUsageWidgetExtension/Info.plist");

  if (appEntitlements.includes("$(APP_GROUP_IDENTIFIER)") && widgetEntitlements.includes("$(APP_GROUP_IDENTIFIER)")) {
    pass("App Group entitlements", "app and widget use $(APP_GROUP_IDENTIFIER)");
  } else {
    fail("App Group entitlements", "missing build setting reference", "Both entitlements must use $(APP_GROUP_IDENTIFIER).");
  }

  if (appPlist.includes("AIUsageAppGroupIdentifier") && widgetPlist.includes("AIUsageAppGroupIdentifier")) {
    pass("App Group runtime lookup", "app and widget plists expose AIUsageAppGroupIdentifier");
  } else {
    fail("App Group runtime lookup", "missing plist key", "SnapshotStore reads AIUsageAppGroupIdentifier at runtime.");
  }

  if (appPlist.includes("NSLocalNetworkUsageDescription") && appPlist.includes("NSAllowsLocalNetworking")) {
    pass("App Local Network plist", "present");
  } else {
    fail("App Local Network plist", "missing local-network keys", "The app must trigger same-Wi-Fi permission with test connection.");
  }

  if (appPlist.includes("NSCameraUsageDescription")) {
    pass("App camera usage plist", "present");
  } else {
    fail("App camera usage plist", "missing NSCameraUsageDescription", "The QR scanner cannot request camera permission without this key.");
  }

  if (widgetPlist.includes("NSLocalNetworkUsageDescription") && widgetPlist.includes("NSAllowsLocalNetworking")) {
    pass("Widget Local Network plist", "present");
  } else {
    warn("Widget Local Network plist", "missing local-network keys", "Widget LAN fetch is best-effort, but extension-originated fetch may need these keys.");
  }

  const appPrivacyManifest = readFileIfExists("ios/AIUsageWidgetApp/PrivacyInfo.xcprivacy");
  const widgetPrivacyManifest = readFileIfExists("ios/AIUsageWidgetExtension/PrivacyInfo.xcprivacy");
  if (
    appPrivacyManifest.includes("NSPrivacyAccessedAPICategoryUserDefaults") &&
    appPrivacyManifest.includes("CA92.1") &&
    widgetPrivacyManifest.includes("NSPrivacyAccessedAPICategoryUserDefaults") &&
    widgetPrivacyManifest.includes("CA92.1")
  ) {
    pass("Privacy manifests", "app/widget declare App Group UserDefaults reason");
  } else {
    fail("Privacy manifests", "missing UserDefaults required-reason coverage", "App and widget use App Group UserDefaults and need PrivacyInfo.xcprivacy coverage.");
  }
}

function checkXcodeProject() {
  if (exists("ios/AIUsageWidget.xcodeproj/project.pbxproj")) {
    pass("Generated Xcode project", "ios/AIUsageWidget.xcodeproj exists");
  } else {
    fail("Generated Xcode project", "missing", "Run npm run generate:ios before opening Xcode.");
  }

  const version = run("xcodebuild", ["-version"], 15_000);
  if (version.status === 0) {
    pass("Xcode command line tools", firstUsefulLine(version.stdout) || "available");
  } else {
    fail("Xcode command line tools", summarizeCommandFailure(version), "Install/open Xcode and select its command line tools.");
  }
}

async function checkConnectorReadiness() {
  if (exists("connector/dist/connector/src/cli.js")) {
    pass("Connector build output", "connector/dist exists");
  } else {
    fail("Connector build output", "connector/dist missing", "Run npm run build:connector before starting the connector.");
  }

  const portAvailable = await isPortAvailable(8787);
  if (portAvailable) {
    pass("Connector port 8787", "available");
  } else {
    warn("Connector port 8787", "already in use", "An aiuw connector may already be running, or another process is using the port.");
  }

  const networkModulePath = path.join(repoRoot, "connector/dist/connector/src/network.js");
  const pairingModulePath = path.join(repoRoot, "connector/dist/connector/src/pairing.js");
  if (!fs.existsSync(networkModulePath) || !fs.existsSync(pairingModulePath)) {
    fail("Pairing host candidates", "connector network module is not built", "Run npm run build:connector, then rerun preflight.");
    return;
  }

  try {
    const network = await import(pathToFileURL(networkModulePath).href);
    const hosts = network.getLanHosts();
    if (hosts.length > 0 && hosts.length <= network.MAX_PAIRING_HOSTS) {
      pass("Pairing host candidates", `${addressSummary(hosts.length)} advertised`);
      if (hosts.some((host) => host.startsWith("169.254."))) {
        warn("Link-local host candidate", "169.254.x.x is present", "This is fine as a fallback, but Wi-Fi/VPN/default-route testing matters on device.");
      }
    } else {
      fail("Pairing host candidates", `unexpected count: ${hosts.length}`, "Connector should emit a short local host list for QR pairing.");
    }
    await checkSwiftPairingParser(pairingModulePath);
  } catch (error) {
    fail("Pairing host candidates", error instanceof Error ? error.message : String(error), "Build connector and rerun preflight.");
  }
}

async function checkSwiftPairingParser(pairingModulePath) {
  const validatorPath = path.join(os.tmpdir(), "aiuw-validate-pairing");
  fs.mkdirSync(path.join(repoRoot, ".swift-module-cache"), { recursive: true });
  const compile = run("swiftc", [
    "-module-cache-path",
    ".swift-module-cache",
    "ios/Tools/ValidatePairingPayload.swift",
    "ios/Shared/PrivacySafeText.swift",
    "ios/Shared/PairingPayload.swift",
    "-o",
    validatorPath
  ], 30_000);
  if (compile.status !== 0) {
    fail("iOS pairing parser build", summarizeCommandFailure(compile), "The Swift pairing parser must compile before QR/device testing.");
    return;
  }

  try {
    const pairing = await import(pathToFileURL(pairingModulePath).href);
    const payload = pairing.buildPairingPayload({
      version: 1,
      deviceId: "preflight-mac",
      name: "Preflight Mac",
      token: "preflight-token-no-whitespace",
      updatedAt: new Date().toISOString()
    }, 8787);
    const result = runWithInput(validatorPath, [], JSON.stringify(payload), 10_000);
    if (result.status === 0) {
      pass("iOS pairing parser", "connector QR payload accepted by PairedDeviceStore");
    } else {
      fail("iOS pairing parser", summarizeCommandFailure(result), "Connector pairing payload and iOS parser drifted; fix before QR testing.");
    }
  } catch (error) {
    fail("iOS pairing parser", error instanceof Error ? error.message : String(error), "Could not build or validate the connector QR payload.");
  }
}

async function checkLaunchdServiceStatus() {
  const launchdModulePath = path.join(repoRoot, "connector/dist/connector/src/launchd.js");
  if (!fs.existsSync(launchdModulePath)) {
    warn("LaunchAgent service status", "connector launchd module is not built", "Run npm run build:connector, then rerun preflight.");
    return;
  }

  try {
    const launchd = await import(pathToFileURL(launchdModulePath).href);
    const status = await launchd.inspectLaunchdService();
    if (!status.plistExists) {
      warn("LaunchAgent service status", "not installed", "Optional: run npm run connector:service:install when you want the connector to start at login.");
      return;
    }

    const modeNote = status.plistMode ? `, plist ${status.plistMode}` : "";
    if (status.launchctl.loaded && status.launchctl.running) {
      pass("LaunchAgent service status", `loaded and running${modeNote}`);
    } else if (status.launchctl.loaded) {
      warn("LaunchAgent service status", `loaded but not reporting running${modeNote}`, "Run npm run connector:service:status and inspect the connector logs.");
    } else {
      warn("LaunchAgent service status", `installed but not loaded${modeNote}`, "Run npm run connector:service:load when you want run-at-login behavior.");
    }
  } catch (error) {
    warn("LaunchAgent service status", error instanceof Error ? error.message : String(error), "This is optional for QR testing; use npm run connector:service:status for details.");
  }
}

async function checkMockConnectorQrHosts() {
  const cliPath = "connector/dist/connector/src/cli.js";
  const networkModulePath = path.join(repoRoot, "connector/dist/connector/src/network.js");
  if (!exists(cliPath) || !fs.existsSync(networkModulePath)) {
    fail("Mock QR host snapshot", "connector build output missing", "Run npm run build:connector before rerunning preflight.");
    return;
  }

  const snapshotValidatorPath = compileSwiftSnapshotValidator();
  if (!snapshotValidatorPath) {
    return;
  }

  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-preflight-config-"));
  const port = await findOpenPort();
  const child = spawn(
    process.execPath,
    [cliPath, "start", "--mock", "fixtures/normal.json", "--port", String(port), "--quiet-pairing"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        AIUW_CONFIG_DIR: configDir
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    await waitFor(
      () => stdout.includes("aiuw connector listening") || child.exitCode !== null,
      5_000,
      () => `timed out: ${safeProcessOutputSummary(stderr || stdout)}`
    );
    if (child.exitCode !== null) {
      fail("Mock QR host snapshot", `connector exited early: ${safeProcessOutputSummary(stderr || stdout)}`, "Run npm run smoke:connector for the shorter loopback smoke.");
      return;
    }

    const config = JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf8"));
    const network = await import(pathToFileURL(networkModulePath).href);
    const hosts = network.getLanHosts();
    const results = [];

    for (const host of hosts) {
      try {
        const ping = await requestJson(`http://${host}:${port}/v1/ping`, config.token);
        if (ping.ok !== true) {
          throw new Error("unexpected ping body");
        }
        const snapshot = await requestJson(`http://${host}:${port}/v1/snapshot`, config.token);
        validateSnapshot(snapshotValidatorPath, snapshot);
        results.push({ host, ok: true });
      } catch (error) {
        results.push({ host, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const reachable = results.filter((result) => result.ok).map((result) => result.host);
    const failed = results.filter((result) => !result.ok);

    if (reachable.length > 0) {
      pass("Mock QR host snapshot", `${addressSummary(reachable.length)} served Swift-valid snapshot`);
      if (failed.length > 0) {
        warn("Some QR hosts failed locally", `${addressSummary(failed.length)} failed`, "The iPhone will try hosts in order; remove persistently bad candidates if device pairing is slow.");
      }
    } else {
      fail("Mock QR host snapshot", failed.length > 0 ? `${addressSummary(failed.length)} failed` : "no reachable host", "The QR payload has no host that can serve a Swift-valid snapshot from this Mac; same-Wi-Fi pairing is unlikely to work.");
    }
  } catch (error) {
    fail("Mock QR host snapshot", error instanceof Error ? error.message : String(error), "Run npm run smoke:connector and inspect connector startup.");
  } finally {
    child.kill("SIGTERM");
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}

function compileSwiftSnapshotValidator() {
  const validatorPath = path.join(os.tmpdir(), "aiuw-validate-snapshot");
  fs.mkdirSync(path.join(repoRoot, ".swift-module-cache"), { recursive: true });
  const compile = run("swiftc", [
    "-module-cache-path",
    ".swift-module-cache",
    "ios/Shared/PrivacySafeText.swift",
    "ios/Shared/AIUsageSnapshot.swift",
    "ios/Tools/ValidateSnapshot.swift",
    "-o",
    validatorPath
  ], 30_000);
  if (compile.status !== 0) {
    fail("iOS snapshot parser build", summarizeCommandFailure(compile), "The Swift snapshot parser must compile before QR/device testing.");
    return undefined;
  }
  return validatorPath;
}

function validateSnapshot(validatorPath, snapshot) {
  const result = runWithInput(
    validatorPath,
    [],
    JSON.stringify(snapshot),
    10_000
  );
  if (result.status !== 0) {
    throw new Error(`Swift snapshot validator rejected /v1/snapshot: ${summarizeCommandFailure(result)}`);
  }
}

function checkDeviceVisibility() {
  if (localOnly) {
    warn("Physical iPhone visibility", "skipped for --local-only", "Run npm run device:preflight before the real iPhone install loop.");
    return;
  }

  const xctrace = run("xcrun", ["xctrace", "list", "devices"], 20_000);
  const physicalIphones = parseXctracePhysicalIphones(xctrace.stdout);
  if (xctrace.status === 0 && physicalIphones.length > 0 && !/No devices available/i.test(xctrace.stdout)) {
    pass("xctrace device visibility", `${physicalIphones.length} physical iPhone${physicalIphones.length === 1 ? "" : "s"} visible`);
  } else {
    fail("xctrace device visibility", summarizeCommandFailure(xctrace), "Connect, unlock, and trust the iPhone; verify it appears in Xcode Devices and Simulators.");
  }

  const devicectlJson = path.join(os.tmpdir(), `aiuw-device-preflight-devices-${process.pid}.json`);
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
  if (devicectl.status === 0 && fs.existsSync(devicectlJson)) {
    try {
      const physicalCoreDevices = collectDevicectlPhysicalIphones(JSON.parse(fs.readFileSync(devicectlJson, "utf8")));
      if (physicalCoreDevices.length > 0) {
        pass("devicectl device visibility", `${physicalCoreDevices.length} physical iPhone${physicalCoreDevices.length === 1 ? "" : "s"} visible`);
      } else {
        fail("devicectl device visibility", "devicectl ran, no available physical iPhone listed", "CoreDeviceService must see the iPhone before command-line install/proof can be automated.");
      }
    } catch (error) {
      fail("devicectl device visibility", error instanceof Error ? error.message : String(error), "CoreDeviceService must return parseable JSON before command-line install/proof can be automated.");
    } finally {
      try {
        fs.unlinkSync(devicectlJson);
      } catch {
        // The temp file contains local device names only; cleanup remains best-effort.
      }
    }
  } else {
    fail("devicectl device visibility", summarizeCommandFailure(devicectl), "CoreDeviceService must see the iPhone before command-line install/proof can be automated.");
    try {
      fs.unlinkSync(devicectlJson);
    } catch {
      // Best-effort cleanup only.
    }
  }
}

console.log(`AI Usage Widget device preflight${localOnly ? " (--local-only)" : ""}\n`);
await checkSigning();
checkPlistsAndEntitlements();
checkXcodeProject();
await checkConnectorReadiness();
await checkLaunchdServiceStatus();
await checkMockConnectorQrHosts();
checkDeviceVisibility();

const width = Math.max(...checks.map((check) => check.name.length), 1);
for (const check of checks) {
  console.log(`${check.status.padEnd(4)} ${check.name.padEnd(width)}  ${check.detail}`);
  if (check.hint) {
    console.log(`     -> ${check.hint}`);
  }
}

const failed = checks.filter((check) => check.status === "FAIL").length;
const warned = checks.filter((check) => check.status === "WARN").length;
console.log(`\n${checks.length - failed - warned} passed, ${warned} warnings, ${failed} failures`);

if (failed > 0) {
  process.exitCode = 1;
}
