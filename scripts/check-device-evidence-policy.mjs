import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { postInstallScreenshotGateBlocked, screenshotProofIssueStatus } from "./lib/device-evidence-policy.mjs";

const deviceEvidenceSource = fs.readFileSync(path.join(process.cwd(), "scripts/device-evidence.mjs"), "utf8");

const cases = [
  {
    name: "local-only evidence does not block on missing screenshots",
    input: {
      localOnly: true,
      installEvidenceReady: true,
      screenshotProofMissingOrInvalidCount: 10,
    },
    expected: false,
  },
  {
    name: "strict evidence does not block on screenshots before install proof",
    input: {
      localOnly: false,
      installEvidenceReady: false,
      screenshotProofMissingOrInvalidCount: 10,
    },
    expected: false,
  },
  {
    name: "strict evidence stays ready when installed screenshots are complete",
    input: {
      localOnly: false,
      installEvidenceReady: true,
      screenshotProofMissingOrInvalidCount: 0,
    },
    expected: false,
  },
  {
    name: "strict evidence blocks after install proof when screenshots are missing",
    input: {
      localOnly: false,
      installEvidenceReady: true,
      screenshotProofMissingOrInvalidCount: 1,
    },
    expected: true,
  },
];

for (const testCase of cases) {
  assert.equal(
    postInstallScreenshotGateBlocked(testCase.input),
    testCase.expected,
    testCase.name
  );
}

assert.equal(
  screenshotProofIssueStatus({
    localOnly: false,
    installEvidenceReady: false,
  }),
  "WARN",
  "strict evidence should warn on invalid screenshot proof before install proof"
);

assert.equal(
  screenshotProofIssueStatus({
    localOnly: true,
    installEvidenceReady: true,
  }),
  "WARN",
  "local-only evidence should warn on invalid screenshot proof even if install proof exists"
);

assert.equal(
  screenshotProofIssueStatus({
    localOnly: false,
    installEvidenceReady: true,
  }),
  "FAIL",
  "strict evidence should fail invalid screenshot proof after install proof"
);

assert.doesNotMatch(
  deviceEvidenceSource,
  /fail\(label,\s*`\$\{file\} is not (?:bound|usable) proof`/,
  "per-screenshot proof issues must not bypass screenshotProofIssueStatus"
);

assert.doesNotMatch(
  deviceEvidenceSource,
  /fail\("Screenshot proof sidecar"/,
  "invalid screenshot-proofs.json must not bypass screenshotProofIssueStatus"
);

assert.match(
  deviceEvidenceSource,
  /recordScreenshotProofIssue\(label,\s*`\$\{file\} is not bound proof`/,
  "sidecar mismatch rows must use recordScreenshotProofIssue"
);

assert.match(
  deviceEvidenceSource,
  /recordScreenshotProofIssue\(label,\s*`\$\{file\} is not usable proof`/,
  "invalid screenshot rows must use recordScreenshotProofIssue"
);

console.log("validated device evidence post-install screenshot policy");
