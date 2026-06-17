import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const moduleCachePath = path.join(repoRoot, ".swift-module-cache");
const validatorPath = path.join(os.tmpdir(), "aiuw-validate-pairing");

fs.mkdirSync(moduleCachePath, { recursive: true });

const compile = spawnSync(
  "swiftc",
  [
    "-module-cache-path",
    ".swift-module-cache",
    "ios/Tools/ValidatePairingPayload.swift",
    "ios/Shared/PrivacySafeText.swift",
    "ios/Shared/PairingPayload.swift",
    "-o",
    validatorPath
  ],
  {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  }
);

if (compile.status !== 0) {
  fail(`failed to compile stdin pairing validator: ${firstUsefulLine(compile.stderr || compile.stdout)}`);
}

const token = "manual-token-no-whitespace";
const manualTerminalBlock = `AI Usage Widget manual pairing payload (contains local bearer token):
{
  "v": 1,
  "deviceId": "mac-test",
  "name": "Test Mac",
  "hosts": ["192.168.1.7"],
  "port": 8787,
  "token": "${token}"
}
`;

const accepted = runValidator(Buffer.from(manualTerminalBlock, "utf8"));
if (accepted.status !== 0) {
  fail(`stdin validator rejected manual terminal block: ${firstUsefulLine(accepted.stderr || accepted.stdout)}`);
}

const acceptedText = `${accepted.stdout}\n${accepted.stderr}`;
if (!accepted.stdout.includes("validated pairing payload: 1 hosts, port 8787")) {
  fail(`stdin validator returned unexpected success output: ${firstUsefulLine(accepted.stdout)}`);
}
if (acceptedText.includes(token)) {
  fail("stdin validator leaked the bearer token in success output");
}

const redactedTerminalBlock = `Terminal JSON is redacted and is not pasteable.
{
  "v": 1,
  "deviceId": "mac-test",
  "name": "Test Mac",
  "hosts": ["192.168.1.7"],
  "port": 8787,
  "tokenRedacted": true
}
`;
const redacted = runValidator(Buffer.from(redactedTerminalBlock, "utf8"));
if (redacted.status === 0) {
  fail("stdin validator accepted redacted terminal output");
}
if (!`${redacted.stdout}\n${redacted.stderr}`.includes("npm run pair:manual")) {
  fail("stdin validator redacted-payload failure did not point to npm run pair:manual");
}

const invalidUTF8 = runValidator(Buffer.from([0xff, 0xfe, 0xfd]));
if (invalidUTF8.status === 0) {
  fail("stdin validator accepted invalid UTF-8 input");
}

console.log("validated stdin pairing validator wrapper");

function runValidator(input) {
  return spawnSync(validatorPath, [], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
}

function firstUsefulLine(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "no output";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
