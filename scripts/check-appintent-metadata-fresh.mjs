import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateAppIntentMetadata } from "./lib/appintent-metadata.mjs";

const repoRoot = process.cwd();
const XCODEBUILD_TIMEOUT_MS = 300_000;
const buildLogPath = path.join(repoRoot, "build", "appintent-metadata-build.log");

function printRows(result) {
  const width = Math.max(...result.rows.map((row) => row.name.length), 1);
  for (const row of result.rows) {
    console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
  }
  console.log(`\n${result.passed} passed, ${result.failures} failures`);
}

function buildUnsignedIphoneos() {
  return spawnSync("xcodebuild", [
    "-project",
    "ios/AIUsageWidget.xcodeproj",
    "-scheme",
    "AIUsageWidgetApp",
    "-sdk",
    "iphoneos",
    "-configuration",
    "Debug",
    "-destination",
    "generic/platform=iOS",
    "-derivedDataPath",
    "build/DerivedData",
    "-destination-timeout",
    "30",
    "CODE_SIGNING_ALLOWED=NO",
    "build",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: XCODEBUILD_TIMEOUT_MS,
  });
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

function stripLocalPaths(text) {
  return String(text ?? "")
    .replaceAll(repoRoot, "<repo>")
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<home>");
}

function writeBuildLog(result) {
  fs.mkdirSync(path.dirname(buildLogPath), { recursive: true });
  fs.writeFileSync(buildLogPath, commandText(result), { mode: 0o600 });
  console.log(`Unsigned AppIntent build log: ${path.relative(repoRoot, buildLogPath)}`);
}

function summarizeBuildFailure(result) {
  if (result.error) {
    return stripLocalPaths(result.error.message);
  }
  if (result.signal) {
    return `terminated by ${result.signal}`;
  }
  return stripLocalPaths(firstUsefulLine(commandText(result)) || `exit ${result.status}`);
}

console.log("AI Usage Widget fresh AppIntent metadata check\n");

let result = validateAppIntentMetadata(repoRoot);
if (result.ok) {
  printRows(result);
  console.log("\nUnsigned AppIntent metadata is already fresh; skipped rebuild.");
  process.exit(0);
}

console.log("Existing unsigned AppIntent metadata is missing, stale, or invalid:");
printRows(result);
console.log("\nRunning npm run device:build:unsigned equivalent before rechecking...\n");

const build = buildUnsignedIphoneos();
writeBuildLog(build);
if (build.status !== 0) {
  console.error(`Unsigned iPhone build failed: ${summarizeBuildFailure(build)}`);
  process.exitCode = build.status === null ? 1 : build.status;
} else {
  console.log("\nRechecking AppIntent metadata after unsigned build...\n");
  result = validateAppIntentMetadata(repoRoot);
  printRows(result);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
