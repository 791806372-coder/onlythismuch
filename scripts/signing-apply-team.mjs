import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, "ios", "Config", "Local.xcconfig");
const relativeConfigPath = "ios/Config/Local.xcconfig";
const teamIdPattern = /^[A-Z0-9]{10}$/;

const args = process.argv.slice(2);
let explicitTeam = "";
let force = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--force") {
    force = true;
  } else if (arg === "--team") {
    explicitTeam = args[index + 1] ?? "";
    index += 1;
  } else if (arg.startsWith("--team=")) {
    explicitTeam = arg.slice("--team=".length);
  } else {
    fail(`Unknown argument: ${arg}`);
  }
}

if (explicitTeam && !teamIdPattern.test(explicitTeam)) {
  fail("--team must be a 10-character uppercase alphanumeric Apple Team ID.");
}

function run(command, commandArgs, timeout = 30_000) {
  const result = spawnSync(command, commandArgs, {
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

function parseTeamIds(text) {
  const ids = new Set();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!/Apple Development/i.test(line)) {
      continue;
    }
    for (const match of line.matchAll(/\(([A-Z0-9]{10})\)/g)) {
      ids.add(match[1]);
    }
  }
  return [...ids].sort();
}

function readDevelopmentTeamLine(text) {
  const lines = text.split(/\r?\n/);
  const matches = [];
  lines.forEach((line, index) => {
    if (/^\s*DEVELOPMENT_TEAM\s*=/.test(line)) {
      matches.push({ line, index });
    }
  });
  return matches;
}

function currentDevelopmentTeam(line) {
  return line.split("=").slice(1).join("=").trim();
}

function replaceDevelopmentTeamLine(text, lineIndex, teamId) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = text.endsWith("\n");
  const lines = text.split(/\r?\n/);
  const line = lines[lineIndex];
  const prefix = line.match(/^(\s*DEVELOPMENT_TEAM\s*=\s*)/)?.[1];
  if (!prefix) {
    fail("Could not safely rewrite DEVELOPMENT_TEAM.");
  }
  lines[lineIndex] = `${prefix}${teamId}`;
  const updated = lines.join(newline);
  return hadTrailingNewline && !updated.endsWith(newline) ? `${updated}${newline}` : updated;
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  fail(`${relativeConfigPath} is missing. Copy ios/Config/Local.xcconfig.example first.`);
}

const identityResult = run("security", ["find-identity", "-v", "-p", "codesigning"]);
if (identityResult.status !== 0) {
  fail("Could not inspect local code-signing identities. Open Xcode Settings > Accounts and finish signing setup, then retry.");
}

const teamIds = parseTeamIds(identityResult.stdout || identityResult.stderr);
if (teamIds.length === 0 && !explicitTeam) {
  fail("No Apple Development Team ID was inferable. Open Xcode Settings > Accounts and create/download an Apple Development certificate.");
}
if (teamIds.length === 0 && explicitTeam && !force) {
  fail(`No local Apple Development identity was found for --team ${explicitTeam}. Use --force only if Xcode shows this Team ID and you understand signing may still fail until the certificate is installed.`);
}
if (teamIds.length > 1 && !explicitTeam) {
  fail(`Multiple Apple Development Team IDs found (${teamIds.join(", ")}). Re-run with --team TEAMID.`);
}
if (explicitTeam && teamIds.length > 0 && !teamIds.includes(explicitTeam) && !force) {
  fail(`--team ${explicitTeam} does not match local Apple Development identities (${teamIds.join(", ")}). Use --force only if this is intentional.`);
}

const selectedTeam = explicitTeam || teamIds[0];
if (!teamIdPattern.test(selectedTeam)) {
  fail("Selected Team ID is malformed.");
}

const configText = fs.readFileSync(configPath, "utf8");
const developmentTeamLines = readDevelopmentTeamLine(configText);
if (developmentTeamLines.length !== 1) {
  fail(`${relativeConfigPath} must contain exactly one DEVELOPMENT_TEAM assignment.`);
}

const [{ line, index }] = developmentTeamLines;
const existingTeam = currentDevelopmentTeam(line);
if (existingTeam && !teamIdPattern.test(existingTeam)) {
  fail(`Existing DEVELOPMENT_TEAM is malformed. Fix ${relativeConfigPath} manually before using this helper.`);
}
if (existingTeam === selectedTeam) {
  console.log(`DEVELOPMENT_TEAM already set to ${selectedTeam}; no changes made.`);
  process.exit(0);
}
if (existingTeam && existingTeam !== selectedTeam && !force) {
  fail(`DEVELOPMENT_TEAM is already ${existingTeam}, not ${selectedTeam}. Re-run with --team ${existingTeam} or use --force to replace it.`);
}

fs.writeFileSync(configPath, replaceDevelopmentTeamLine(configText, index, selectedTeam), "utf8");
console.log(`Updated ${relativeConfigPath}: DEVELOPMENT_TEAM = ${selectedTeam}`);
