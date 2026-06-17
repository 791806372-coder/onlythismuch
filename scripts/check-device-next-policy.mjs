import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const deviceNext = fs.readFileSync(path.join(repoRoot, "scripts/device-next.mjs"), "utf8");
const deviceDiscovery = fs.readFileSync(path.join(repoRoot, "scripts/lib/device-discovery.mjs"), "utf8");
const packageJson = fs.readFileSync(path.join(repoRoot, "package.json"), "utf8");
const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
const iosReadme = fs.readFileSync(path.join(repoRoot, "ios/README.md"), "utf8");
const status = fs.readFileSync(path.join(repoRoot, "outputs/AI-Usage-Widget-Implementation-Status.md"), "utf8");

assertIncludes(
  packageJson,
  '"device:preflight:local": "node scripts/device-preflight.mjs --local-only"',
  "package.json must keep the local preflight script available"
);
assertIncludes(
  packageJson,
  '"device:signing:apply": "node scripts/signing-apply-team.mjs"',
  "package.json must expose the safe signing team helper"
);
assertIncludes(
  packageJson,
  "node --check scripts/signing-apply-team.mjs",
  "check:scripts must syntax-check the signing team helper"
);
assertIncludes(
  packageJson,
  "node scripts/check-device-discovery.mjs",
  "check:scripts must run the strict device discovery parser checks"
);
assertIncludes(
  deviceNext,
  '"npm run device:preflight:local"',
  "device:next must recommend local preflight while signing/device access is blocked"
);
assertIncludes(
  deviceNext,
  '"npm run device:evidence:local"',
  "device:next must recommend local evidence while signing/device access is blocked"
);
assertBefore(
  deviceNext,
  '"npm run device:preflight:local"',
  '"npm run device:build:unsigned"',
  "device:next should list local preflight before unsigned build proof"
);
assertBefore(
  deviceNext,
  '"npm run device:evidence:local"',
  '"npm run device:evidence"',
  "device:next should list local evidence before strict evidence while blocked"
);
assertIncludes(
  deviceNext,
  "device:preflight:local is the no-signing readiness gate",
  "device:next should explain why local preflight matters"
);
assertIncludes(
  deviceNext,
  "strict device:evidence remains the post-install gate",
  "device:next should explain local evidence is not the post-install proof"
);
assertIncludes(
  deviceNext,
  "loadSnapshotParser()(snapshot)",
  "device:next live connector readiness must validate the full snapshot contract"
);
assertIncludes(
  deviceNext,
  "connector/dist/src/contract/schema.js",
  "device:next should use the built connector contract parser for live snapshot validation"
);
assertIncludes(
  deviceNext,
  "process.env.AIUW_CONFIG_DIR",
  "device:next should honor isolated connector config dirs like the connector and evidence scripts"
);
assertIncludes(
  deviceNext,
  "--json-output",
  "device:next CoreDevice readiness should use devicectl JSON output like the signing diagnosis"
);
assertIncludes(
  deviceNext,
  "aiuw-device-next-devices-",
  "device:next CoreDevice readiness should use an isolated temp JSON path"
);
assertIncludes(
  deviceNext,
  "collectDevicectlPhysicalIphones(parsed)",
  "device:next CoreDevice readiness should parse devicectl JSON devices instead of substring matching error output"
);
assertIncludes(
  deviceNext,
  "./lib/device-discovery.mjs",
  "device:next should use the shared strict device discovery parser"
);
assertIncludes(
  deviceDiscovery,
  "value.error",
  "shared device discovery should reject devicectl error JSON"
);
assertIncludes(
  deviceDiscovery,
  "remembered|placeholder",
  "shared device discovery should reject unavailable remembered placeholder devices"
);
assertIncludes(
  deviceNext,
  "configReady && signingReady && !teamMismatch && device.ok",
  "device:next readiness should not report device-ready booleans before signing/config gates are ready"
);
assertIncludes(
  deviceNext,
  "npm run device:signing:apply",
  "device:next should recommend the safe DEVELOPMENT_TEAM helper after Xcode account setup"
);
assertIncludes(
  deviceNext,
  "npm run device:signing:apply -- --team TEAMID",
  "device:next should require explicit team selection when multiple teams are present"
);
assertIncludes(
  deviceNext,
  "npm run device:signing:apply -- --team TEAMID --force",
  "device:next should mention the conservative force path for intentional DEVELOPMENT_TEAM replacement"
);
assertIncludes(
  deviceNext,
  "printApprovalQaCommands",
  "device:next should have a dedicated approval screenshot command loop"
);
assertIncludes(
  deviceNext,
  "npm run connector:approvals:seed",
  "device:next should tell device QA how to seed a Mac-owned approval request"
);
assertIncludes(
  deviceNext,
  "tap 从 Mac 拉请求 on iPhone",
  "device:next should tell device QA to fetch the Mac-owned approval request from iPhone"
);
assertIncludes(
  deviceNext,
  "npm run connector:approvals:clear",
  "device:next should tell device QA how to reset the pending request"
);
assertBefore(
  readme,
  "npm run device:preflight:local",
  "npm run device:build:unsigned",
  "README should show local preflight before unsigned build proof"
);
assertBefore(
  iosReadme,
  "npm run device:preflight:local",
  "npm run device:build:unsigned",
  "ios/README should show local preflight before unsigned build proof"
);
assertBefore(
  status,
  "npm run device:preflight:local",
  "npm run device:next",
  "status next steps should put local preflight before device:next"
);

const signingApplySource = fs.readFileSync(path.join(repoRoot, "scripts/signing-apply-team.mjs"), "utf8");
assertIncludes(
  signingApplySource,
  'run("security", ["find-identity", "-v", "-p", "codesigning"])',
  "signing helper must inspect local code-signing identities"
);
assertIncludes(
  signingApplySource,
  "const teamIdPattern = /^[A-Z0-9]{10}$/",
  "signing helper must validate Apple Team ID shape"
);
assertIncludes(
  signingApplySource,
  "developmentTeamLines.length !== 1",
  "signing helper must only update a single DEVELOPMENT_TEAM assignment"
);
assertIncludes(
  signingApplySource,
  "fs.writeFileSync(configPath, replaceDevelopmentTeamLine",
  "signing helper must preserve Local.xcconfig except for the DEVELOPMENT_TEAM line"
);
assertIncludes(
  signingApplySource,
  "teamIds.length > 1 && !explicitTeam",
  "signing helper must require --team when multiple Team IDs are found"
);
assertIncludes(
  signingApplySource,
  "teamIds.length === 0 && explicitTeam && !force",
  "signing helper must require --force before writing a manual Team ID with no local identity"
);

console.log("validated device-next local preflight guidance");

function assertIncludes(text, expected, message) {
  if (!text.includes(expected)) {
    fail(`${message}; missing "${expected}"`);
  }
}

function assertBefore(text, first, second, message) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  if (firstIndex === -1 || secondIndex === -1 || firstIndex > secondIndex) {
    fail(message);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
