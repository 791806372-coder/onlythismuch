import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCodexAppServerRateLimits,
  type CodexAppServerUsageOverlay,
} from "../src/codexAppServer";
import { collectCurrentSnapshot } from "../src/collectors";
import type { CommandResult, CommandRunner } from "../src/collectors";

const config = {
  version: 1 as const,
  deviceId: "mac-test",
  name: "Test Mac",
  token: "test-token",
  updatedAt: "2026-06-11T00:00:00.000Z",
};

test("parses Codex app-server rate limits into sanitized usage", () => {
  const overlay = parseCodexAppServerRateLimits({
    limitId: "codex",
    planType: "pro",
    primary: {
      usedPercent: 26,
      windowDurationMins: 300,
      resetsAt: 1773320436,
    },
    secondary: {
      usedPercent: 89,
      windowDurationMins: 10080,
      resetsAt: 1773879554,
    },
    accountEmail: "kai@example.com",
    apiToken: "do-not-ship",
  }, "2026-06-13T06:50:00Z");

  assert.deepEqual(overlay.codex, {
    capturedAt: "2026-06-13T06:50:00Z",
    usage: {
      available: true,
      source: "codex_app_server",
      fiveHourRemainingPercent: 74,
      fiveHourResetAt: "2026-03-12T13:00:36.000Z",
      weeklyRemainingPercent: 11,
      weeklyResetAt: "2026-03-19T00:19:14.000Z",
    },
  } satisfies NonNullable<CodexAppServerUsageOverlay["codex"]>);
  assert.equal(JSON.stringify(overlay).includes("kai@example.com"), false);
  assert.equal(JSON.stringify(overlay).includes("do-not-ship"), false);
});

test("invalid Codex app-server windows fail closed", () => {
  assert.deepEqual(parseCodexAppServerRateLimits({
    primary: {
      usedPercent: 26,
      windowDurationMins: 60,
      resetsAt: 1773320436,
    },
    secondary: {
      usedPercent: 89,
      windowDurationMins: 10080,
      resetsAt: 1773879554,
    },
  }), {});
  assert.deepEqual(parseCodexAppServerRateLimits({
    primary: {
      usedPercent: 26.5,
      windowDurationMins: 300,
      resetsAt: 1773320436,
    },
    secondary: {
      usedPercent: 89,
      windowDurationMins: 10080,
      resetsAt: 1773879554,
    },
  }), {});
});

test("overlays Codex app-server usage when only optional status probe is unavailable", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": { status: "timeout", stdout: "", stderr: "" },
    }),
    {
      codexAppServer: true,
      codexAppServerCollector: async () => ({
        codex: {
          capturedAt: "2026-06-13T06:50:00Z",
          usage: {
            available: true,
            source: "codex_app_server",
            fiveHourRemainingPercent: 74,
            fiveHourResetAt: "2026-06-13T10:00:00Z",
            weeklyRemainingPercent: 11,
            weeklyResetAt: "2026-06-19T10:00:00Z",
          },
        },
      }),
    }
  );

  const codex = snapshot.providers.find((provider) => provider.id === "codex");
  assert.equal(codex?.connected, true);
  assert.equal(codex?.health, "degraded");
  assert.equal(codex?.usage.available, true);
  assert.equal(codex?.usage.available && codex.usage.source, "codex_app_server");
  assert.equal(codex?.usage.available && codex.usage.fiveHourRemainingPercent, 74);
  assert.equal(codex?.usage.available && codex.usage.weeklyRemainingPercent, 11);
});

test("Codex app-server usage does not override real Codex status warnings", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "warning" })),
    }),
    {
      codexAppServer: true,
      codexAppServerCollector: async () => ({
        codex: {
          capturedAt: "2026-06-13T06:50:00Z",
          usage: {
            available: true,
            source: "codex_app_server",
            fiveHourRemainingPercent: 74,
            fiveHourResetAt: "2026-06-13T10:00:00Z",
            weeklyRemainingPercent: 11,
            weeklyResetAt: "2026-06-19T10:00:00Z",
          },
        },
      }),
    }
  );

  const codex = snapshot.providers.find((provider) => provider.id === "codex");
  assert.equal(codex?.connected, true);
  assert.equal(codex?.health, "degraded");
  assert.equal(codex?.usage.available, false);
  assert.equal(!codex?.usage.available && codex?.usage.reason, "no_stable_source");
  assert.equal(codex?.error?.code, "status_probe_warning");
});

function fakeRunner(results: Record<string, CommandResult>): CommandRunner {
  return async (command, args) => {
    const key = [command, ...args].join(" ");
    const result = results[key];
    if (!result) {
      throw new Error(`Missing fake result for ${key}`);
    }

    return result;
  };
}

function ok(stdout: string): CommandResult {
  return { status: "ok", stdout, stderr: "", exitCode: 0 };
}
