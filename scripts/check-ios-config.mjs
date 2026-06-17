import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function readFile(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
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
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function sourcePlistValue(relativePath, key) {
  return plistValue(absolute(relativePath), key);
}

function sourcePlistJSON(relativePath) {
  const file = absolute(relativePath);
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

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function embeddedWidgetPath(appPath) {
  const embedded = path.join(appPath, "PlugIns", "AIUsageWidgetExtension.appex");
  return fs.existsSync(embedded) ? embedded : undefined;
}

function checkLocalConfig() {
  const configPath = "ios/Config/Local.xcconfig";
  if (!exists(configPath)) {
    fail("Local config", "ios/Config/Local.xcconfig missing", "Copy ios/Config/Local.xcconfig.example before building the iOS project.");
    return {};
  }

  const config = parseXcconfig(configPath);
  pass("Local config", "present");

  if (config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX) {
    pass("Bundle prefix", config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX);
  } else {
    fail("Bundle prefix", "missing", "Set PRODUCT_BUNDLE_IDENTIFIER_PREFIX to a signable reverse-DNS prefix.");
  }

  if (config.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    pass("App Group identifier", config.APP_GROUP_IDENTIFIER);
  } else {
    fail("App Group identifier", config.APP_GROUP_IDENTIFIER || "missing", "Set APP_GROUP_IDENTIFIER to a value starting with group.");
  }

  if (!config.DEVELOPMENT_TEAM) {
    warn("Development team", "empty", "Expected before Apple signing is configured; this check does not require signing.");
  }

  return config;
}

function checkExampleConfig(config) {
  const example = parseXcconfig("ios/Config/Local.xcconfig.example");
  if (!example.PRODUCT_BUNDLE_IDENTIFIER_PREFIX || !example.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    fail("Example config", "bundle prefix or App Group example missing", "Keep Local.xcconfig.example usable for first setup.");
    return;
  }

  if (
    config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX &&
    example.PRODUCT_BUNDLE_IDENTIFIER_PREFIX !== config.PRODUCT_BUNDLE_IDENTIFIER_PREFIX
  ) {
    warn("Example bundle prefix", example.PRODUCT_BUNDLE_IDENTIFIER_PREFIX, "Local.xcconfig may intentionally differ, but keep docs aligned.");
  } else {
    pass("Example bundle prefix", example.PRODUCT_BUNDLE_IDENTIFIER_PREFIX);
  }

  if (config.APP_GROUP_IDENTIFIER && example.APP_GROUP_IDENTIFIER !== config.APP_GROUP_IDENTIFIER) {
    warn("Example App Group", example.APP_GROUP_IDENTIFIER, "Local.xcconfig may intentionally differ, but keep docs aligned.");
  } else {
    pass("Example App Group", example.APP_GROUP_IDENTIFIER);
  }
}

function checkSourceWiring() {
  const project = readFile("ios/project.yml");
  const snapshotStore = readFile("ios/Shared/SnapshotStore.swift");

  if (project.includes("Debug: Config/Local.xcconfig") && project.includes("Release: Config/Local.xcconfig")) {
    pass("XcodeGen config", "Debug/Release use Config/Local.xcconfig");
  } else {
    fail("XcodeGen config", "Local.xcconfig not wired for Debug/Release", "project.yml must keep signing/App Group settings in Local.xcconfig.");
  }

  if (
    project.includes("PRODUCT_BUNDLE_IDENTIFIER: $(PRODUCT_BUNDLE_IDENTIFIER_PREFIX).aiusagewidget") &&
    project.includes("PRODUCT_BUNDLE_IDENTIFIER: $(PRODUCT_BUNDLE_IDENTIFIER_PREFIX).aiusagewidget.widget")
  ) {
    pass("Bundle id wiring", "app/widget use PRODUCT_BUNDLE_IDENTIFIER_PREFIX");
  } else {
    fail("Bundle id wiring", "missing PRODUCT_BUNDLE_IDENTIFIER_PREFIX reference", "App and widget bundle IDs must come from the local config.");
  }

  if (countOccurrences(project, "TARGETED_DEVICE_FAMILY: 1") >= 2) {
    pass("iPhone target family", "app/widget are iPhone-targeted");
  } else {
    fail("iPhone target family", "missing TARGETED_DEVICE_FAMILY: 1", "This V1 is an iPhone widget/app; keep app and widget targets iPhone-only before App Store packaging.");
  }

  const projectRefs = [
    ["App plist project ref", "INFOPLIST_FILE: AIUsageWidgetApp/Info.plist"],
    ["Widget plist project ref", "INFOPLIST_FILE: AIUsageWidgetExtension/Info.plist"],
    ["App entitlements project ref", "CODE_SIGN_ENTITLEMENTS: AIUsageWidgetApp/AIUsageWidgetApp.entitlements"],
    ["Widget entitlements project ref", "CODE_SIGN_ENTITLEMENTS: AIUsageWidgetExtension/AIUsageWidgetExtension.entitlements"],
  ];
  for (const [label, needle] of projectRefs) {
    if (project.includes(needle)) {
      pass(label, "project.yml points at expected file");
    } else {
      fail(label, "missing or changed", "project.yml must point app/widget targets at the checked plist and entitlement files.");
    }
  }

  const plistRefs = [
    ["App Info.plist", "ios/AIUsageWidgetApp/Info.plist"],
    ["Widget Info.plist", "ios/AIUsageWidgetExtension/Info.plist"],
  ];
  for (const [label, file] of plistRefs) {
    const value = sourcePlistValue(file, "AIUsageAppGroupIdentifier");
    if (value === "$(APP_GROUP_IDENTIFIER)") {
      pass(label, "AIUsageAppGroupIdentifier uses $(APP_GROUP_IDENTIFIER)");
    } else {
      fail(label, `AIUsageAppGroupIdentifier=${value ?? "missing"}`, "Runtime App Group lookup must use the APP_GROUP_IDENTIFIER build setting.");
    }
  }

  const entitlementRefs = [
    ["App entitlements", "ios/AIUsageWidgetApp/AIUsageWidgetApp.entitlements"],
    ["Widget entitlements", "ios/AIUsageWidgetExtension/AIUsageWidgetExtension.entitlements"],
  ];
  for (const [label, file] of entitlementRefs) {
    const value = sourcePlistJSON(file)?.["com.apple.security.application-groups"]?.[0];
    if (value === "$(APP_GROUP_IDENTIFIER)") {
      pass(label, "application group uses $(APP_GROUP_IDENTIFIER)");
    } else {
      fail(label, `application group=${value ?? "missing"}`, "Signed entitlements must use the APP_GROUP_IDENTIFIER build setting.");
    }
  }

  if (
    snapshotStore.includes('object(forInfoDictionaryKey: "AIUsageAppGroupIdentifier")') &&
    snapshotStore.includes("fallbackIdentifier") &&
    snapshotStore.includes("guard !resolved.source.usesFallback else") &&
    snapshotStore.includes("return nil") &&
    snapshotStore.includes("statusDetailText")
  ) {
    pass("SnapshotStore runtime key", "reads AIUsageAppGroupIdentifier and fails closed on fallback");
  } else {
    fail("SnapshotStore runtime key", "missing strict AIUsageAppGroupIdentifier lookup", "SnapshotStore must read the expanded plist key and treat fallback as unavailable.");
  }

  checkCameraUsageDescription();
  checkLaunchScreen();
  checkPrivacyManifests();
}

function checkCameraUsageDescription() {
  const value = sourcePlistValue("ios/AIUsageWidgetApp/Info.plist", "NSCameraUsageDescription");
  if (value && value.includes("二维码")) {
    pass("App camera usage plist", "declares QR scanner camera permission reason");
  } else {
    fail("App camera usage plist", value ?? "missing", "The QR scanner needs NSCameraUsageDescription before device testing.");
  }
}

function checkLaunchScreen() {
  const plist = sourcePlistJSON("ios/AIUsageWidgetApp/Info.plist");
  if (plist?.UILaunchScreen && typeof plist.UILaunchScreen === "object" && !Array.isArray(plist.UILaunchScreen)) {
    pass("App launch screen", "UILaunchScreen configured");
  } else {
    fail("App launch screen", "missing", "The app target needs UILaunchScreen before device/App Store packaging.");
  }
}

function checkPrivacyManifests() {
  const manifestRefs = [
    ["App privacy manifest", "ios/AIUsageWidgetApp/PrivacyInfo.xcprivacy"],
    ["Widget privacy manifest", "ios/AIUsageWidgetExtension/PrivacyInfo.xcprivacy"],
  ];
  for (const [label, file] of manifestRefs) {
    const plist = sourcePlistJSON(file);
    const accessed = plist?.NSPrivacyAccessedAPITypes;
    const userDefaults = Array.isArray(accessed)
      ? accessed.find((entry) => entry?.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults")
      : undefined;
    const hasUserDefaultsReason =
      Array.isArray(userDefaults?.NSPrivacyAccessedAPITypeReasons) &&
      userDefaults.NSPrivacyAccessedAPITypeReasons.includes("CA92.1");
    const noTracking = plist?.NSPrivacyTracking === false;
    const noCollectedData = Array.isArray(plist?.NSPrivacyCollectedDataTypes) &&
      plist.NSPrivacyCollectedDataTypes.length === 0;

    if (hasUserDefaultsReason && noTracking && noCollectedData) {
      pass(label, "declares App Group UserDefaults reason and no tracking/data collection");
    } else {
      fail(label, "missing required privacy declaration", "App and widget use App Group UserDefaults and need PrivacyInfo.xcprivacy coverage.");
    }
  }

  const generatedProject = exists("ios/AIUsageWidget.xcodeproj/project.pbxproj")
    ? readFile("ios/AIUsageWidget.xcodeproj/project.pbxproj")
    : "";
  checkGeneratedSharedSourceRefs(generatedProject);
  const privacyResourceCount = countOccurrences(generatedProject, "PrivacyInfo.xcprivacy in Resources");
  if (privacyResourceCount >= 2) {
    pass("Privacy manifest project refs", "app/widget resources include PrivacyInfo.xcprivacy");
  } else {
    fail("Privacy manifest project refs", `found ${privacyResourceCount}`, "Regenerate the Xcode project so app and widget targets include PrivacyInfo.xcprivacy.");
  }
}

function checkGeneratedSharedSourceRefs(generatedProject) {
  if (!generatedProject) {
    fail("Generated Xcode project", "ios/AIUsageWidget.xcodeproj/project.pbxproj missing", "Run npm run generate:ios.");
    return;
  }

  const sharedSwiftFiles = fs
    .readdirSync(absolute("ios/Shared"))
    .filter((file) => file.endsWith(".swift"))
    .sort();
  const missing = [];
  for (const file of sharedSwiftFiles) {
    const sourceCount = countOccurrences(generatedProject, `${file} in Sources`);
    if (sourceCount < 3) {
      missing.push(`${file}:${sourceCount}`);
    }
  }

  if (missing.length === 0) {
    pass("Generated shared Swift refs", `${sharedSwiftFiles.length} files in app/widget/tests sources`);
  } else {
    fail(
      "Generated shared Swift refs",
      missing.join(", "),
      "Run npm run generate:ios after adding or renaming files in ios/Shared."
    );
  }
}

function checkBuiltAppGroup(name, appPath, expectedGroup) {
  if (!fs.existsSync(appPath)) {
    warn(name, "build product not found", "Build this configuration before checking expanded App Group values.");
    return;
  }

  const widgetPath = embeddedWidgetPath(appPath);
  if (!widgetPath) {
    fail(name, "embedded widget missing", "The app product must embed AIUsageWidgetExtension.appex.");
    return;
  }

  const appValue = plistValue(path.join(appPath, "Info.plist"), "AIUsageAppGroupIdentifier");
  const widgetValue = plistValue(path.join(widgetPath, "Info.plist"), "AIUsageAppGroupIdentifier");
  if (appValue === expectedGroup && widgetValue === expectedGroup) {
    pass(name, `${expectedGroup} in app and widget`);
  } else {
    fail(
      name,
      `app=${appValue ?? "missing"}, widget=${widgetValue ?? "missing"}`,
      "Expanded AIUsageAppGroupIdentifier must match ios/Config/Local.xcconfig."
    );
  }
}

function checkBuiltProducts(config) {
  if (!config.APP_GROUP_IDENTIFIER?.startsWith("group.")) {
    warn("Built App Group values", "skipped without valid APP_GROUP_IDENTIFIER", "Fill APP_GROUP_IDENTIFIER before checking expanded products.");
    return;
  }

  checkBuiltAppGroup(
    "Simulator App Group value",
    absolute("build/DerivedData/Build/Products/Debug-iphonesimulator/AIUsageWidgetApp.app"),
    config.APP_GROUP_IDENTIFIER
  );
  checkBuiltAppGroup(
    "Device App Group value",
    absolute("build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app"),
    config.APP_GROUP_IDENTIFIER
  );
}

console.log("AI Usage Widget iOS config check\n");
const config = checkLocalConfig();
checkExampleConfig(config);
checkSourceWiring();
checkBuiltProducts(config);

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
