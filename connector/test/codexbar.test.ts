import assert from "node:assert/strict";
import test from "node:test";
import { collectCurrentSnapshot } from "../src/collectors";
import {
  collectCodexBarUsage,
  parseCodexBarUsageOutput,
  type CodexBarUsageOverlay,
} from "../src/codexbar";
import type { CommandResult, CommandRunner } from "../src/collectors";

const config = {
  version: 1 as const,
  deviceId: "mac-test",
  name: "Test Mac",
  token: "test-token",
  updatedAt: "2026-06-11T00:00:00.000Z",
};

test("parses only allowlisted CodexBar usage fields", () => {
  const overlay = parseCodexBarUsageOutput(JSON.stringify({
    provider: "codex",
    version: "0.6.0",
    source: "openai-web",
    usage: {
      primary: {
        usedPercent: 28,
        windowMinutes: 300,
        resetsAt: "2026-06-11T19:15:00Z",
      },
      secondary: {
        usedPercent: 59,
        windowMinutes: 10080,
        resetsAt: "2026-06-12T17:00:00Z",
      },
      updatedAt: "2026-06-11T18:10:22Z",
      identity: {
        accountEmail: "kai@example.com",
      },
      accountEmail: "kai@example.com",
    },
    openaiDashboard: {
      signedInEmail: "kai@example.com",
    },
    apiToken: "do-not-ship",
  }), "0.17.0", "2026-06-11T18:10:22Z");

  assert.deepEqual(overlay.codex, {
    capturedAt: "2026-06-11T18:10:22Z",
    version: "0.6.0",
    usage: {
      available: true,
      source: "codexbar",
      sourceVersion: "0.17.0",
      fiveHourRemainingPercent: 72,
      fiveHourResetAt: "2026-06-11T19:15:00Z",
      weeklyRemainingPercent: 41,
      weeklyResetAt: "2026-06-12T17:00:00Z",
    },
  } satisfies NonNullable<CodexBarUsageOverlay["codex"]>);
  assert.equal(JSON.stringify(overlay).includes("kai@example.com"), false);
  assert.equal(JSON.stringify(overlay).includes("do-not-ship"), false);
});

test("ignores incomplete CodexBar usage windows", () => {
  const overlay = parseCodexBarUsageOutput(JSON.stringify({
    provider: "claude",
    usage: {
      primary: {
        usedPercent: 12,
        windowMinutes: 300,
        resetsAt: "2026-06-11T19:15:00Z",
      },
      updatedAt: "2026-06-11T18:10:22Z",
    },
  }));

  assert.deepEqual(overlay, {});
});

test("drops non-version CodexBar version text", () => {
  const overlay = parseCodexBarUsageOutput(JSON.stringify({
    provider: "codex",
    version: "Bearer do-not-ship",
    usage: completeUsage(23, 89),
  }), "apiToken do-not-ship", "2026-06-11T18:10:22Z");

  const codex = overlay.codex;
  assert(codex);
  assert.equal(codex.version, undefined);
  assert.equal(codex.usage.available, true);
  if (codex.usage.available) {
    assert.equal(codex.usage.sourceVersion, undefined);
  }
  assert.equal(JSON.stringify(overlay).includes("do-not-ship"), false);
  assert.equal(JSON.stringify(overlay).includes("Bearer"), false);
});

test("invalid CodexBar JSON, provider, dates, and percents fail soft", () => {
  assert.deepEqual(parseCodexBarUsageOutput("{nope", "0.17.0"), {});
  assert.deepEqual(parseCodexBarUsageOutput(JSON.stringify({
    provider: "gemini",
    usage: completeUsage(23, 89),
  }), "0.17.0", "2026-06-11T18:10:22Z"), {});
  assert.deepEqual(parseCodexBarUsageOutput(JSON.stringify({
    provider: "codex",
    usage: completeUsage(150, 89),
  }), "0.17.0", "2026-06-11T18:10:22Z"), {});
  assert.deepEqual(parseCodexBarUsageOutput(JSON.stringify({
    provider: "codex",
    usage: completeUsage(23.5, 89),
  }), "0.17.0", "2026-06-11T18:10:22Z"), {});
  assert.deepEqual(parseCodexBarUsageOutput(JSON.stringify({
    provider: "codex",
    usage: completeUsage(23, 89, "tomorrow"),
  }), "0.17.0", "2026-06-11T18:10:22Z"), {});
  assert.deepEqual(parseCodexBarUsageOutput(JSON.stringify({
    provider: "codex",
    usage: completeUsage(23, 89, "2026-06-11T19:15:00"),
  }), "0.17.0", "2026-06-11T18:10:22Z"), {});
  assert.deepEqual(parseCodexBarUsageOutput(JSON.stringify({
    provider: "codex",
    usage: completeUsage(23, 89),
  }), "0.17.0", "2026-06-11T18:10:22"), {});
});

test("future, proxy, or alias provider names do not map to V1 usage overlays", () => {
  for (const provider of [
    "openclaw-codex",
    "claude-proxy",
    "hermes",
    "codexbar-claude",
    "claude code proxy",
    "Claude Code",
    "OpenAI Codex",
  ]) {
    assert.deepEqual(parseCodexBarUsageOutput(JSON.stringify({
      provider,
      usage: completeUsage(23, 89),
    }), "0.17.0", "2026-06-11T18:10:22Z"), {}, provider);
  }

  assert.equal(parseCodexBarUsageOutput(JSON.stringify({
    provider: "Claude",
    usage: completeUsage(23, 89),
  }), "0.17.0", "2026-06-11T18:10:22Z").claude?.usage.available, true);
  assert.equal(parseCodexBarUsageOutput(JSON.stringify({
    provider: "Codex",
    usage: completeUsage(23, 89),
  }), "0.17.0", "2026-06-11T18:10:22Z").codex?.usage.available, true);
});

test("CodexBar runner uses fixed command args, timeout, and output cap", async () => {
  const calls: Array<{
    command: string;
    args: string[];
    timeoutMs: number;
    maxOutputBytes: number;
  }> = [];
  const overlay = await collectCodexBarUsage(async (command, args, options) => {
    calls.push({ command, args, ...options });
    if (args.includes("--version")) {
      return ok("CodexBarCLI 0.17.0");
    }
    return ok(JSON.stringify({
      provider: "codex",
      usage: completeUsage(23, 89),
    }));
  });

  assert.equal(overlay.codex?.usage.available, true);
  assert.deepEqual(calls, [
    {
      command: "codexbar",
      args: ["--version"],
      timeoutMs: 8000,
      maxOutputBytes: 1024,
    },
    {
      command: "codexbar",
      args: ["usage", "--provider", "both", "--format", "json", "--json-only"],
      timeoutMs: 8000,
      maxOutputBytes: 16384,
    },
  ]);
});

test("overlays CodexBar usage onto Tier 0 providers through the snapshot contract", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "ok" })),
      "codexbar --version": ok("CodexBarCLI 0.17.0"),
      "codexbar usage --provider both --format json --json-only": ok(JSON.stringify([
        {
          provider: "codex",
          version: "0.6.0",
          usage: {
            primary: {
              usedPercent: 28,
              windowMinutes: 300,
              resetsAt: "2026-06-11T19:15:00Z",
            },
            secondary: {
              usedPercent: 59,
              windowMinutes: 10080,
              resetsAt: "2026-06-12T17:00:00Z",
            },
            updatedAt: "2026-06-11T18:10:22Z",
            accountEmail: "kai@example.com",
          },
        },
        {
          provider: "claude",
          version: "2.0.58",
          usage: {
            primary: {
              usedPercent: 12,
              windowMinutes: 300,
              resetsAt: "2026-06-11T20:00:00Z",
            },
            secondary: {
              usedPercent: 37,
              windowMinutes: 10080,
              resetsAt: "2026-06-13T06:00:00Z",
            },
            updatedAt: "2026-06-11T18:11:00Z",
            identity: {
              accountEmail: "kai@example.com",
            },
          },
        },
      ])),
    }),
    { codexBar: true }
  );

  const codex = snapshot.providers.find((provider) => provider.id === "codex");
  const claude = snapshot.providers.find((provider) => provider.id === "claude");

  assert.equal(codex?.usage.available, true);
  assert.equal(codex?.usage.available && codex.usage.fiveHourRemainingPercent, 72);
  assert.equal(codex?.usage.available && codex.usage.weeklyRemainingPercent, 41);
  assert.equal(claude?.usage.available, true);
  assert.equal(claude?.usage.available && claude.usage.fiveHourRemainingPercent, 88);
  assert.equal(claude?.usage.available && claude.usage.weeklyRemainingPercent, 63);
  assert.equal(JSON.stringify(snapshot).includes("kai@example.com"), false);
});

test("CodexBar usage does not promote a Tier 0 logged-out provider", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": failed("Not logged in as kai@example.com"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "ok" })),
      "codexbar --version": ok("CodexBarCLI 0.17.0"),
      "codexbar usage --provider both --format json --json-only": ok(JSON.stringify({
        provider: "codex",
        version: "0.6.0",
        usage: completeUsage(28, 59),
      })),
    }),
    { codexBar: true }
  );

  const codex = snapshot.providers.find((provider) => provider.id === "codex");

  assert.equal(codex?.connected, false);
  assert.equal(codex?.health, "degraded");
  assert.equal(codex?.usage.available, false);
  assert.equal(!codex?.usage.available && codex?.usage.reason, "not_logged_in");
  assert.equal(JSON.stringify(snapshot).includes("kai@example.com"), false);
});

test("CodexBar usage does not override Claude third-party no-quota", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated\nAPI provider: openrouter\nkai@example.com"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "ok" })),
      "codexbar --version": ok("CodexBarCLI 0.17.0"),
      "codexbar usage --provider both --format json --json-only": ok(JSON.stringify({
        provider: "claude",
        version: "2.0.58",
        usage: completeUsage(12, 37),
      })),
    }),
    { codexBar: true }
  );

  const claude = snapshot.providers.find((provider) => provider.id === "claude");

  assert.equal(claude?.connected, true);
  assert.equal(claude?.health, "working");
  assert.equal(claude?.usage.available, false);
  assert.equal(!claude?.usage.available && claude?.usage.reason, "third_party_no_quota");
  assert.equal(JSON.stringify(snapshot).includes("kai@example.com"), false);
});

test("CodexBar usage does not override degraded Codex doctor status", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "warning" })),
      "codexbar --version": ok("CodexBarCLI 0.17.0"),
      "codexbar usage --provider both --format json --json-only": ok(JSON.stringify({
        provider: "codex",
        version: "0.6.0",
        usage: completeUsage(28, 59),
      })),
    }),
    { codexBar: true }
  );

  const codex = snapshot.providers.find((provider) => provider.id === "codex");

  assert.equal(codex?.connected, true);
  assert.equal(codex?.health, "degraded");
  assert.equal(codex?.usage.available, false);
  assert.equal(!codex?.usage.available && codex?.usage.reason, "no_stable_source");
  assert.equal(codex?.error?.code, "status_probe_warning");
});

test("default snapshot collection does not call CodexBar", async () => {
  const seenCommands: string[] = [];
  await collectCurrentSnapshot(
    config,
    async (command, args) => {
      seenCommands.push([command, ...args].join(" "));
      if (command === "codexbar") {
        throw new Error("CodexBar should be opt-in");
      }
      return ok(command === "codex" ? "codex 0.139.0" : "Authenticated");
    }
  );

  assert.equal(seenCommands.some((command) => command.startsWith("codexbar ")), false);
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

function failed(stdout: string): CommandResult {
  return { status: "failed", stdout, stderr: "", exitCode: 1 };
}

function completeUsage(
  primaryUsedPercent: number,
  secondaryUsedPercent: number,
  primaryReset = "2026-06-11T19:15:00Z",
  secondaryReset = "2026-06-12T17:00:00Z"
): Record<string, unknown> {
  return {
    primary: {
      usedPercent: primaryUsedPercent,
      resetsAt: primaryReset,
    },
    secondary: {
      usedPercent: secondaryUsedPercent,
      resetsAt: secondaryReset,
    },
  };
}
