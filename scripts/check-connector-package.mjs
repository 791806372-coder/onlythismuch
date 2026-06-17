import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const connectorRoot = path.join(repoRoot, "connector");
const packagePath = path.join(connectorRoot, "package.json");
const lockPath = path.join(connectorRoot, "package-lock.json");
const expectedBinPath = "dist/connector/src/cli.js";
const failures = [];

const packageJson = readJson(packagePath);
const lockJson = readJson(lockPath);
const packageBin = packageJson.bin?.aiuw;
const lockBin = lockJson.packages?.[""]?.bin?.aiuw;

if (packageBin !== expectedBinPath) {
  failures.push(`connector/package.json bin.aiuw must be ${expectedBinPath}, got ${String(packageBin)}`);
}

if (lockBin !== packageBin) {
  failures.push(`connector/package-lock.json bin.aiuw must match package.json, got ${String(lockBin)}`);
}

const builtCliPath = path.join(connectorRoot, expectedBinPath);
if (!fs.existsSync(builtCliPath)) {
  failures.push(`built connector CLI is missing at connector/${expectedBinPath}; run npm --prefix connector run build`);
} else {
  const firstLine = fs.readFileSync(builtCliPath, "utf8").split(/\r?\n/, 1)[0];
  if (firstLine !== "#!/usr/bin/env node") {
    failures.push(`built connector CLI must keep the node shebang, got ${firstLine || "[empty first line]"}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exit(1);
}

console.log(`validated connector package bin: aiuw -> ${expectedBinPath}`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
