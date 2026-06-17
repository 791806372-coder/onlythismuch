import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

if ([...args].some((arg) => arg !== "--check")) {
  console.error("Usage: node scripts/setup-local.mjs [--check]");
  process.exit(1);
}

const steps = [];
const failures = [];

function record(status, name, detail) {
  steps.push({ status, name, detail });
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function packageInstallNeeded(rootRelativePath) {
  const packageJsonPath = path.join(repoRoot, rootRelativePath, "package.json");
  const nodeModulesPath = path.join(repoRoot, rootRelativePath, "node_modules");
  const nodeModulesLock = path.join(nodeModulesPath, ".package-lock.json");
  if (!fs.existsSync(nodeModulesLock)) {
    return true;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const dependencyNames = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ];
  for (const dependencyName of dependencyNames) {
    if (!fs.existsSync(path.join(nodeModulesPath, dependencyName))) {
      return true;
    }
  }
  return false;
}

function run(name, command, args, options = {}) {
  const display = [command, ...args].join(" ");
  record("RUN", name, display);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    shell: false,
    env: process.env,
  });
  if (result.status !== 0) {
    failures.push(`${name} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function maybeInstall(name, rootRelativePath, commandArgs) {
  const needed = packageInstallNeeded(rootRelativePath);
  if (!needed) {
    record("PASS", name, "dependencies present");
    return;
  }

  if (checkOnly) {
    failures.push(`${name} dependencies are missing or stale; run npm run setup:local`);
    record("FAIL", name, "dependencies missing or stale");
    return;
  }

  run(name, "npm", commandArgs, { cwd: repoRoot });
}

console.log(`AI Usage Widget local setup${checkOnly ? " check" : ""}`);
console.log("");

if (Number.parseInt(process.versions.node.split(".", 1)[0] ?? "0", 10) < 20) {
  failures.push(`Node.js 20+ is required; found ${process.version}`);
  record("FAIL", "Node.js", process.version);
} else {
  record("PASS", "Node.js", process.version);
}

if (!exists("package-lock.json") || !exists("connector/package-lock.json")) {
  failures.push("package-lock.json files must exist before local setup");
}

maybeInstall("Root npm install", ".", ["ci"]);
maybeInstall("Connector npm install", "connector", ["--prefix", "connector", "ci"]);

if (!exists("ios/Config/Local.xcconfig")) {
  if (checkOnly) {
    failures.push("ios/Config/Local.xcconfig is missing; run npm run setup:local");
    record("FAIL", "iOS local config", "missing");
  } else {
    fs.copyFileSync(
      path.join(repoRoot, "ios", "Config", "Local.xcconfig.example"),
      path.join(repoRoot, "ios", "Config", "Local.xcconfig")
    );
    record("PASS", "iOS local config", "created from Local.xcconfig.example");
  }
} else {
  record("PASS", "iOS local config", "present");
}

if (failures.length === 0 || !checkOnly) {
  if (!exists("ios/AIUsageWidget.xcodeproj/project.pbxproj")) {
    if (checkOnly) {
      failures.push("ios/AIUsageWidget.xcodeproj is missing; run npm run setup:local");
      record("FAIL", "Xcode project", "missing");
    } else {
      run("Generate iOS project", "npm", ["run", "generate:ios"]);
    }
  } else {
    record("PASS", "Xcode project", "present");
  }
  run("Connector build", "npm", ["run", "build:connector"]);
  run("Connector package guard", "npm", ["run", "check:connector-package"]);
  run("Local device preflight", "npm", ["run", "device:preflight:local"]);
}

console.log("");
for (const step of steps) {
  console.log(`${step.status.padEnd(4)} ${step.name.padEnd(26)} ${step.detail}`);
}

if (failures.length > 0) {
  console.log("");
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exit(1);
}

console.log("");
console.log("Local setup is ready for mock connector pairing. Apple signing and real iPhone install remain separate gates.");
console.log("Next manual commands: npm run start:mock, then npm run connector:doctor:live.");
