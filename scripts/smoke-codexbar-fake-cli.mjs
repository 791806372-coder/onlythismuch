import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectCodexBarUsage } = require("../connector/dist/connector/src/codexbar.js");
const { runLimitedCommand } = require("../connector/dist/connector/src/collectors.js");

const EMAIL_VALUE_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const FORBIDDEN_TEXT_RE = /authorization|bearer|cookie|transcript|apitoken|secret|credential|raw-provider-output|provider-output|raw log/i;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-codexbar-fixture-"));
const fakeCodexBarPath = path.join(tempDir, "codexbar");
const commandResults = [];

const usageFixture = JSON.stringify([
  {
    provider: "codex",
    version: "0.6.0",
    usage: {
      primary: {
        usedPercent: 28,
        resetsAt: "2026-06-11T19:15:00Z",
      },
      secondary: {
        usedPercent: 59,
        resetsAt: "2026-06-12T17:00:00Z",
      },
      accountEmail: "kai@example.com",
      apiToken: "do-not-ship",
      transcript: "do-not-ship",
    },
    openaiDashboard: {
      signedInEmail: "kai@example.com",
      cookie: "do-not-ship",
    },
  },
  {
    provider: "claude",
    version: "2.0.58",
    usage: {
      primary: {
        usedPercent: 12,
        resetsAt: "2026-06-11T20:00:00Z",
      },
      secondary: {
        usedPercent: 37,
        resetsAt: "2026-06-13T06:00:00Z",
      },
      identity: {
        accountEmail: "kai@example.com",
      },
    },
  },
  {
    provider: "codexbar-claude",
    usage: {
      primary: {
        usedPercent: 1,
        resetsAt: "2026-06-11T20:00:00Z",
      },
      secondary: {
        usedPercent: 2,
        resetsAt: "2026-06-13T06:00:00Z",
      },
    },
  },
]);

try {
  fs.writeFileSync(
    fakeCodexBarPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version") {
  console.error("Bearer do-not-ship transcript do-not-ship");
  console.log("CodexBarCLI 0.17.0");
  process.exit(0);
}
if (args.join(" ") === "usage --provider both --format json --json-only") {
  console.error("raw-provider-output do-not-ship secret do-not-ship");
  process.stdout.write(${JSON.stringify(usageFixture)});
  process.exit(0);
}
console.error("unexpected codexbar fixture args");
process.exit(64);
`,
    { mode: 0o700 }
  );

  const overlay = await collectCodexBarUsage(async (command, args, options) => {
    assert.equal(command, "codexbar");
    const result = await runLimitedCommand(fakeCodexBarPath, args, options);
    commandResults.push({
      command,
      args,
      status: result.status,
      exitCode: result.exitCode ?? null,
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
    });
    return result;
  });

  assert.equal(overlay.codex?.usage.available, true);
  assert.equal(overlay.codex?.usage.available && overlay.codex.usage.source, "codexbar");
  assert.equal(overlay.codex?.usage.available && overlay.codex.usage.sourceVersion, "0.17.0");
  assert.equal(overlay.codex?.usage.available && overlay.codex.usage.fiveHourRemainingPercent, 72);
  assert.equal(overlay.codex?.usage.available && overlay.codex.usage.weeklyRemainingPercent, 41);
  assert.equal(overlay.claude?.usage.available, true);
  assert.equal(overlay.claude?.usage.available && overlay.claude.usage.fiveHourRemainingPercent, 88);
  assert.equal(overlay.claude?.usage.available && overlay.claude.usage.weeklyRemainingPercent, 63);
  assert.deepEqual(Object.keys(overlay).sort(), ["claude", "codex"]);

  const payload = {
    ok: true,
    mode: "codexbar-fake-cli-subprocess",
    commands: stableCommandResults(commandResults),
    providers: ["claude", "codex"].map((id) => summarizeProvider(id, overlay[id])),
    note: "Fake CLI stdout/stderr is never printed.",
  };

  const serialized = JSON.stringify(payload, null, 2);
  if (EMAIL_VALUE_RE.test(serialized) || FORBIDDEN_TEXT_RE.test(serialized)) {
    throw new Error("CodexBar fixture smoke output contained forbidden text");
  }

  console.log(serialized);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function summarizeProvider(id, overlayEntry) {
  return {
    id,
    usageAvailable: overlayEntry?.usage?.available === true,
    source: overlayEntry?.usage?.available ? overlayEntry.usage.source : null,
    sourceVersion: overlayEntry?.usage?.available ? overlayEntry.usage.sourceVersion ?? null : null,
    fiveHourRemainingPercent: overlayEntry?.usage?.available
      ? overlayEntry.usage.fiveHourRemainingPercent
      : null,
    weeklyRemainingPercent: overlayEntry?.usage?.available
      ? overlayEntry.usage.weeklyRemainingPercent
      : null,
    resetTimesPresent: Boolean(
      overlayEntry?.usage?.available &&
      overlayEntry.usage.fiveHourResetAt &&
      overlayEntry.usage.weeklyResetAt
    ),
  };
}

function stableCommandResults(results) {
  return [...results].sort((a, b) => {
    const left = [a.command, ...a.args].join(" ");
    const right = [b.command, ...b.args].join(" ");
    return left.localeCompare(right);
  });
}
