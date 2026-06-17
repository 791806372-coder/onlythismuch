import fs from "node:fs";
import path from "node:path";

const COMMON_INPUTS = [
  "ios/Config/Local.xcconfig",
  "ios/AIUsageWidget.xcodeproj/project.pbxproj",
  "ios/project.yml",
];

const APP_INPUT_ROOTS = [
  "ios/AIUsageWidgetApp",
  "ios/Shared",
];

const WIDGET_INPUT_ROOTS = [
  "ios/AIUsageWidgetExtension",
  "ios/Shared",
];

const TEST_INPUT_ROOTS = [
  "ios/AIUsageWidgetTests",
  "ios/AIUsageWidgetApp",
  "ios/AIUsageWidgetExtension",
  "ios/Shared",
];

export function iphoneosBuildFreshness(repoRoot) {
  return buildFreshness(repoRoot, "Debug-iphoneos");
}

export function iosTestBuildFreshness(repoRoot) {
  const productsRoot = path.join(repoRoot, "build", "DerivedData", "Build", "Products");
  const appBundle = path.join(productsRoot, "Debug-iphoneos", "AIUsageWidgetApp.app");
  const testBundle = path.join(appBundle, "PlugIns", "AIUsageWidgetTests.xctest");
  const xctestrunOutputs = xctestrunFiles(productsRoot, "AIUsageWidgetTests_iphoneos");
  const tests = targetFreshness(repoRoot, {
    name: "xctest",
    inputRoots: TEST_INPUT_ROOTS,
    codeOutputs: [
      path.join(testBundle, "AIUsageWidgetTests"),
    ],
    metadataOutputs: xctestrunOutputs,
  });
  const present = fs.existsSync(testBundle) && xctestrunOutputs.length > 0 && tests.present;

  return {
    present,
    fresh: present && tests.fresh,
    detail: present && tests.fresh
      ? "XCTest bundle and xctestrun are newer than test inputs"
      : tests.detail,
    tests,
    testBundle,
    xctestrunOutputs,
  };
}

export function buildFreshness(repoRoot, configurationDir) {
  const productsDir = path.join(repoRoot, "build", "DerivedData", "Build", "Products", configurationDir);
  const appBundle = path.join(productsDir, "AIUsageWidgetApp.app");
  const widgetBundle = embeddedWidgetPath(appBundle) ?? path.join(productsDir, "AIUsageWidgetExtension.appex");
  const app = targetFreshness(repoRoot, {
    name: "app",
    inputRoots: APP_INPUT_ROOTS,
    codeOutputs: [
      path.join(appBundle, "AIUsageWidgetApp"),
      path.join(appBundle, "AIUsageWidgetApp.debug.dylib"),
    ],
    metadataOutputs: [
      path.join(appBundle, "Info.plist"),
      path.join(appBundle, "PrivacyInfo.xcprivacy"),
      ...localizedInfoPlistOutputPaths(repoRoot, "ios/AIUsageWidgetApp", appBundle),
    ],
  });
  const widget = targetFreshness(repoRoot, {
    name: "widget",
    inputRoots: WIDGET_INPUT_ROOTS,
    codeOutputs: [
      path.join(widgetBundle, "AIUsageWidgetExtension"),
      path.join(widgetBundle, "AIUsageWidgetExtension.debug.dylib"),
    ],
    metadataOutputs: [
      path.join(widgetBundle, "Info.plist"),
      path.join(widgetBundle, "PrivacyInfo.xcprivacy"),
      ...localizedInfoPlistOutputPaths(repoRoot, "ios/AIUsageWidgetExtension", widgetBundle),
    ],
  });

  const present = fs.existsSync(appBundle) && fs.existsSync(widgetBundle) && app.present && widget.present;
  const fresh = present && app.fresh && widget.fresh;
  const detail = fresh
    ? "app/widget outputs are newer than target inputs"
    : [app, widget]
        .filter((target) => !target.fresh)
        .map((target) => `${target.name}: ${target.detail}`)
        .join("; ");

  return { present, fresh, detail, app, widget };
}

function targetFreshness(repoRoot, target) {
  const commonInputFiles = COMMON_INPUTS
    .map((relativePath) => path.join(repoRoot, relativePath))
    .filter((file) => fs.existsSync(file));
  const targetInputFiles = unique(
    target.inputRoots.flatMap((relativeRoot) => listFiles(path.join(repoRoot, relativeRoot)))
  ).filter((file) => fs.existsSync(file));
  const swiftInputFiles = targetInputFiles.filter((file) => file.endsWith(".swift"));
  const metadataInputFiles = targetInputFiles.filter((file) => !file.endsWith(".swift"));
  const codeOutputs = target.codeOutputs.filter((file) => fs.existsSync(file));
  const metadataOutputs = target.metadataOutputs.filter((file) => fs.existsSync(file));
  const allOutputs = unique([...codeOutputs, ...metadataOutputs]);

  if (codeOutputs.length === 0 || metadataOutputs.length === 0) {
    const missing = [...target.codeOutputs, ...target.metadataOutputs]
      .filter((file) => !fs.existsSync(file))
      .map((file) => path.relative(repoRoot, file));
    return {
      name: target.name,
      present: false,
      fresh: false,
      detail: `missing ${missing.join(", ")}`,
    };
  }

  const checks = [
    freshnessCheck(repoRoot, "swift", swiftInputFiles, codeOutputs),
    freshnessCheck(repoRoot, "metadata", metadataInputFiles, metadataOutputs),
    freshnessCheck(repoRoot, "project", commonInputFiles, allOutputs),
  ];
  const stale = checks.filter((check) => !check.fresh);
  const fresh = stale.length === 0;
  return {
    name: target.name,
    present: true,
    fresh,
    detail: fresh
      ? `${target.name} outputs are fresh`
      : stale.map((check) => check.detail).join(", "),
  };
}

function freshnessCheck(repoRoot, label, inputs, outputs) {
  const newestInput = newest(inputs);
  const newestOutput = newest(outputs);
  if (!newestInput || !newestOutput) {
    return {
      fresh: false,
      detail: `${label} timestamp unavailable`,
    };
  }

  const fresh = newestInput.mtimeMs <= newestOutput.mtimeMs + 1000;
  return {
    fresh,
    detail: fresh
      ? `${label} fresh`
      : `${label} ${path.relative(repoRoot, newestInput.file)} is newer than ${path.relative(repoRoot, newestOutput.file)}`,
  };
}

function embeddedWidgetPath(appBundle) {
  const embedded = path.join(appBundle, "PlugIns", "AIUsageWidgetExtension.appex");
  return fs.existsSync(embedded) ? embedded : undefined;
}

function xctestrunFiles(productsRoot, prefix) {
  if (!fs.existsSync(productsRoot)) {
    return [];
  }

  return fs.readdirSync(productsRoot)
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith(".xctestrun"))
    .map((entry) => path.join(productsRoot, entry))
    .sort();
}

function localizedInfoPlistOutputPaths(repoRoot, sourceRelativeRoot, bundle) {
  return listFiles(path.join(repoRoot, sourceRelativeRoot))
    .filter((file) => {
      const localeDirectory = path.basename(path.dirname(file));
      return path.basename(file) === "InfoPlist.strings" && localeDirectory.endsWith(".lproj");
    })
    .map((file) => {
      const localeDirectory = path.basename(path.dirname(file));
      return path.join(bundle, localeDirectory, "InfoPlist.strings");
    });
}

function listFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return [root];
  }

  const pending = [root];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    const currentStat = fs.statSync(current);
    if (currentStat.isDirectory()) {
      for (const child of fs.readdirSync(current)) {
        if (child === ".DS_Store") {
          continue;
        }
        pending.push(path.join(current, child));
      }
    } else if (currentStat.isFile()) {
      files.push(current);
    }
  }
  return files.sort();
}

function newest(files) {
  return files
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

function unique(values) {
  return [...new Set(values)];
}
