import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { collectDevicectlPhysicalIphones, parseXctracePhysicalIphones } from "./lib/device-discovery.mjs";

const repoRoot = process.cwd();
const rows = [];

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

function run(command, args, timeout = 30_000) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
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

function commandText(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function checkLocalConfig() {
  const configPath = "ios/Config/Local.xcconfig";
  const config = parseXcconfig(configPath);
  if (!fs.existsSync(path.join(repoRoot, configPath))) {
    fail("Local signing config", "missing", "Copy ios/Config/Local.xcconfig.example first.");
    return config;
  }

  pass("Local signing config", configPath);

  if (config.DEVELOPMENT_TEAM) {
    pass("DEVELOPMENT_TEAM", "configured");
  } else {
    fail("DEVELOPMENT_TEAM", "empty", "Fill this from Xcode Account Team ID or an Apple Development certificate team ID.");
  }

  if (config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX) {
    pass("Bundle prefix", config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX);
  } else {
    fail("Bundle prefix", "empty", "Use a reverse-DNS prefix you can sign, for example com.kai.");
  }

  if (config.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    pass("App Group identifier", config.APP_GROUP_IDENTIFIER);
  } else {
    fail("App Group identifier", config.APP_GROUP_IDENTIFIER || "empty", "Use an App Group identifier starting with group.");
  }

  return config;
}

function checkXcode() {
  const version = run("xcodebuild", ["-version"], 15_000);
  if (version.status === 0) {
    pass("Xcode", firstUsefulLine(version.stdout) || "available");
  } else {
    fail("Xcode", summarize(version), "Open Xcode and finish first-launch setup.");
  }

  const firstLaunch = run("xcodebuild", ["-checkFirstLaunchStatus"], 30_000);
  if (firstLaunch.status === 0) {
    pass("Xcode first launch", "complete");
  } else {
    warn("Xcode first launch", summarize(firstLaunch), "Open Xcode once or run xcodebuild -runFirstLaunch if Xcode asks for components.");
  }
}

function checkSigningIdentities(config) {
  const result = run("security", ["find-identity", "-v", "-p", "codesigning"], 30_000);
  if (result.status !== 0) {
    warn("Code signing identities", summarize(result), "Open Xcode Settings > Accounts and add/download signing certificates.");
    return;
  }

  const output = commandText(result);
  const appleDevelopmentLines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /Apple Development/i.test(line));
  const teamIds = parseTeamIds(appleDevelopmentLines.join("\n"));
  const xcodeTeamIds = xcodeProvisioningTeamIds();

  if (appleDevelopmentLines.length === 0) {
    fail("Apple Development identities", "0 valid identities found", "Xcode needs an Apple Development signing certificate before device install.");
  } else {
    pass("Apple Development identities", `${appleDevelopmentLines.length} found`);
    if (config.DEVELOPMENT_TEAM) {
      if (teamIds.includes(config.DEVELOPMENT_TEAM)) {
        pass("DEVELOPMENT_TEAM identity match", "configured team matches a local Apple Development identity");
      } else if (xcodeTeamIds.includes(config.DEVELOPMENT_TEAM)) {
        pass("DEVELOPMENT_TEAM Xcode account match", "configured team is available in Xcode Accounts");
      } else {
        fail(
          "DEVELOPMENT_TEAM identity match",
          "configured team is not among local Apple Development identities",
          "Update ios/Config/Local.xcconfig or use the intended Apple Development certificate."
        );
      }
    }
  }

  const likelyTeamIds = [...new Set([...teamIds, ...xcodeTeamIds])].sort();
  if (likelyTeamIds.length === 1) {
    pass("Likely DEVELOPMENT_TEAM", "1 Apple Development/Xcode Account team inferred");
    if (!config.DEVELOPMENT_TEAM) {
      warn("Suggested config edit", "run npm run device:signing:apply", "Confirm it is the intended Apple team before applying.");
    }
  } else if (likelyTeamIds.length > 1) {
    warn("Likely DEVELOPMENT_TEAM", `${likelyTeamIds.length} Apple Development/Xcode Account teams found`, "Choose the intended team in Xcode Settings > Accounts.");
  } else {
    warn("Likely DEVELOPMENT_TEAM", "not inferable from local identities", "Use Xcode Settings > Accounts > Team ID.");
  }
}

function checkProvisioningProfiles(config) {
  const profileDirs = [
    path.join(os.homedir(), "Library", "MobileDevice", "Provisioning Profiles"),
    path.join(os.homedir(), "Library", "Developer", "Xcode", "UserData", "Provisioning Profiles"),
  ];
  const profiles = profileDirs.flatMap((profilesDir) => {
    if (!fs.existsSync(profilesDir)) {
      return [];
    }
    return fs.readdirSync(profilesDir)
      .filter((file) => file.endsWith(".mobileprovision"))
      .map((file) => path.join(profilesDir, file));
  });

  if (profiles.length === 0 && profileDirs.every((profilesDir) => !fs.existsSync(profilesDir))) {
    warn("Provisioning profiles", "folder not found", "Xcode may create profiles after signing/account setup.");
    return;
  }

  if (profiles.length === 0) {
    warn("Provisioning profiles", "none found", "Xcode can create/download profiles after signing/account setup.");
    return;
  }

  pass("Provisioning profiles", `${profiles.length} local profile(s)`);
  if (config.APP_GROUP_IDENTIFIER) {
    warn("App Group profile check", "manual", "If device signing fails, confirm the profile enables the configured App Group.");
  }
}

function checkDeviceVisibility() {
  const devicectlJson = path.join(os.tmpdir(), `aiuw-signing-diagnose-devices-${process.pid}.json`);
  try {
    fs.unlinkSync(devicectlJson);
  } catch {
    // Best-effort cleanup only; stale temp files do not affect the diagnosis.
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
      const physicalIphones = collectDevicectlPhysicalIphones(JSON.parse(fs.readFileSync(devicectlJson, "utf8")));
      if (physicalIphones.length > 0) {
        pass("CoreDevice iPhone", "listed by devicectl");
      } else {
        warn("CoreDevice iPhone", "devicectl ran but no available physical iPhone found", "Connect, unlock, trust, and check Xcode Devices.");
      }
    } catch (error) {
      fail("CoreDevice iPhone", error instanceof Error ? error.message : String(error), "Fix Xcode/CoreDevice JSON output before command-line install.");
    }
  } else {
    fail("CoreDevice iPhone", summarize(devicectl), "Fix Xcode/CoreDevice visibility before command-line install.");
  }
  try {
    fs.unlinkSync(devicectlJson);
  } catch {
    // Best-effort cleanup only; the temp file contains device names, not project state.
  }

  const xctrace = run("xcrun", ["xctrace", "list", "devices"], 30_000);
  const physicalIphones = xctrace.status === 0 ? parseXctracePhysicalIphones(xctrace.stdout) : [];
  if (physicalIphones.length > 0 && !/No devices available/i.test(xctrace.stdout)) {
    pass("xctrace iPhone", `${physicalIphones.length} physical iPhone${physicalIphones.length === 1 ? "" : "s"} visible`);
  } else {
    fail("xctrace iPhone", summarize(xctrace), "Connect, unlock, trust, and verify the iPhone appears in Xcode.");
  }
}

console.log("AI Usage Widget signing diagnosis\n");
const config = checkLocalConfig();
checkXcode();
checkSigningIdentities(config);
checkProvisioningProfiles(config);
checkDeviceVisibility();

const width = Math.max(...rows.map((row) => row.name.length), 1);
for (const row of rows) {
  console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  if (row.hint) {
    console.log(`     -> ${row.hint}`);
  }
}

const failed = rows.filter((row) => row.status === "FAIL").length;
const warned = rows.filter((row) => row.status === "WARN").length;
console.log(`\n${rows.length - failed - warned} passed, ${warned} warnings, ${failed} failures`);

if (failed > 0) {
  process.exitCode = 1;
}
