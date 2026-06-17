import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-preflight-policy-"));
const localPairingSmoke = fs.readFileSync(path.join(repoRoot, "scripts/smoke-local-pairing.mjs"), "utf8");

try {
  fs.mkdirSync(path.join(tempRoot, "ios/Config"), { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, "ios/Config/Local.xcconfig"),
    [
      "DEVELOPMENT_TEAM =",
      "PRODUCT_BUNDLE_IDENTIFIER_PREFIX = com.superzhangkai",
      "APP_GROUP_IDENTIFIER = group.com.superzhangkai.aiusagewidget",
      ""
    ].join("\n")
  );

  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "scripts/device-preflight.mjs"), "--local-only"],
    {
      cwd: tempRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    }
  );

  const output = `${result.stdout}\n${result.stderr}`;
  if (result.status === 0) {
    fail("local-only preflight exited 0 even though required local files were missing");
  }
  assertIncludes(output, "WARN DEVELOPMENT_TEAM", "empty DEVELOPMENT_TEAM should stay warning-level in local-only mode");
  assertIncludes(output, "FAIL App Group entitlements", "missing local App Group files should fail");
  assertIncludes(output, "FAIL Generated Xcode project", "missing generated Xcode project should fail");
  assertIncludes(output, "FAIL Connector build output", "missing connector build output should fail");
  assertIncludes(output, "FAIL Pairing host candidates", "missing connector network module should fail");
  assertIncludes(output, "FAIL Mock QR host snapshot", "missing mock connector output should fail");
  assertIncludes(output, "WARN Physical iPhone visibility", "physical iPhone visibility should stay warning-level in local-only mode");
  assertIncludes(localPairingSmoke, "reachableHosts.length === 0", "local pairing smoke should fail only when no advertised host works");
  assertIncludes(localPairingSmoke, "fallback addresses failed", "local pairing smoke should report failed fallback addresses without failing the whole proof");

  console.log("validated device preflight local-only failure policy");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function assertIncludes(text, expected, message) {
  if (!text.includes(expected)) {
    fail(`${message}; missing "${expected}"`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
