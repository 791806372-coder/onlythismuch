import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const buildLogPath = path.join(repoRoot, "build", "ios-tests-build.log");

const args = [
  "-project",
  "ios/AIUsageWidget.xcodeproj",
  "-scheme",
  "AIUsageWidgetTests",
  "-sdk",
  "iphoneos",
  "-configuration",
  "Debug",
  "-destination",
  "generic/platform=iOS",
  "-derivedDataPath",
  "build/DerivedData",
  "CODE_SIGNING_ALLOWED=NO",
  "build-for-testing",
];

function runBuild() {
  return spawnSync("xcodebuild", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
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

function writeBuildLog(result) {
  fs.mkdirSync(path.dirname(buildLogPath), { recursive: true });
  fs.writeFileSync(buildLogPath, commandText(result), { mode: 0o600 });
  console.log(`Native XCTest build log: ${path.relative(repoRoot, buildLogPath)}`);
}

function stripLocalPaths(text) {
  return String(text ?? "")
    .replaceAll(repoRoot, "<repo>")
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "<home>");
}

function printResultSummary(result) {
  if (result.status === 0) {
    console.log("Native XCTest build completed.");
    return;
  }
  const detail = result.error?.message ||
    (result.signal ? `terminated by ${result.signal}` : firstUsefulLine(commandText(result))) ||
    `exit ${result.status}`;
  console.error(`Native XCTest build failed: ${stripLocalPaths(detail)}`);
}

function isRetryableDestinationFailure(result) {
  const output = commandText(result);
  return (
    result.status !== 0 &&
    output.includes("Unable to find a destination matching the provided destination specifier") &&
    output.includes("platform:iOS")
  );
}

let result = runBuild();
writeBuildLog(result);
printResultSummary(result);

if (isRetryableDestinationFailure(result)) {
  console.error("\nRetrying once after transient Xcode iOS destination lookup failure...\n");
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  result = runBuild();
  writeBuildLog(result);
  printResultSummary(result);
}

process.exitCode = result.status === null ? 1 : result.status;
