import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildCollectorPath,
  collectCurrentSnapshot,
  collectProvider,
  discoverAppBundleExecutables,
  discoverVersionStoreExecutables,
  providerCommandCandidates,
  readAppBundleVersion,
  type CommandResult,
  type CommandRunner,
  type ProviderSpec,
} from "../src/collectors";

const codexSpec: ProviderSpec = {
  id: "codex",
  displayName: "Codex",
  command: "codex",
  versionArgs: ["--version"],
  authArgs: ["login", "status"],
};

const codexFallbackSpec: ProviderSpec = {
  ...codexSpec,
  commandCandidates: ["codex", "/tmp/aiuw-test-codex"],
};

const codexDoctorSpec: ProviderSpec = {
  ...codexSpec,
  statusProbeArgs: ["doctor", "--json", "--summary"],
};

const claudeSpec: ProviderSpec = {
  id: "claude",
  displayName: "Claude",
  command: "claude",
  versionArgs: ["--version"],
  authArgs: ["auth", "status"],
};

const config = {
  version: 1 as const,
  deviceId: "mac-test",
  name: "Test Mac",
  token: "test-token",
  updatedAt: "2026-06-11T00:00:00.000Z",
};

test("reads only sanitized app bundle version metadata", () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-app-bundle-test-"));
  const contentsDir = path.join(appDir, "Contents");
  fs.mkdirSync(contentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(contentsDir, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleShortVersionString</key>
  <string>1.2.3</string>
</dict>
</plist>
`,
    "utf8"
  );

  assert.equal(readAppBundleVersion(appDir), "1.2.3");
});

test("collector PATH includes common local CLI and runtime directories first", () => {
  const collectorPath = buildCollectorPath("/usr/bin:/custom/bin", "/Users/tester");
  const parts = collectorPath.split(":");

  assert.deepEqual(parts.slice(0, 6), [
    "/Users/tester/.local/bin",
    "/Users/tester/.hermes/node/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ]);
  assert.equal(parts.includes("/custom/bin"), true);
  assert.equal(parts.filter((part) => part === "/usr/bin").length, 1);
});

test("discovers executable provider binaries from version stores", () => {
  const versionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-claude-versions-"));
  const oldVersion = path.join(versionsDir, "2.1.172");
  const newVersion = path.join(versionsDir, "2.1.173");
  const notes = path.join(versionsDir, "README.txt");
  fs.writeFileSync(oldVersion, "#!/bin/sh\n", "utf8");
  fs.writeFileSync(newVersion, "#!/bin/sh\n", "utf8");
  fs.writeFileSync(notes, "not executable", "utf8");
  fs.chmodSync(oldVersion, 0o755);
  fs.chmodSync(newVersion, 0o755);

  assert.deepEqual(discoverVersionStoreExecutables([versionsDir]), [
    newVersion,
    oldVersion,
  ]);
  assert.deepEqual(providerCommandCandidates({
    ...claudeSpec,
    commandCandidates: ["claude"],
    versionStoreCandidates: [versionsDir],
  }), [
    "claude",
    newVersion,
    oldVersion,
  ]);
});

test("discovers provider executables inside app bundles", () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-app-exec-test-"));
  const executable = path.join(appDir, "Contents", "Resources", "codex");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, "#!/bin/sh\n", "utf8");
  fs.chmodSync(executable, 0o755);

  assert.deepEqual(discoverAppBundleExecutables({
    appBundleCandidates: [appDir],
    appBundleExecutableRelativePaths: ["Contents/Resources/codex"],
  }), [executable]);
});

test("connected Tier 0 provider never reports usage percentages", async () => {
  const provider = await collectProvider(
    codexSpec,
    fakeRunner({
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
    })
  );

  assert.equal(provider.connected, true);
  assert.equal(provider.health, "working");
  assert.equal(provider.version, "0.139.0");
  assert.equal("capturedAt" in provider, false);
  assert.deepEqual(provider.usage, {
    available: false,
    reason: "no_stable_source",
  });
});

test("provider collector falls back to version-store executables", async () => {
  const versionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-claude-versions-"));
  const executable = path.join(versionsDir, "2.1.173");
  fs.writeFileSync(executable, "#!/bin/sh\n", "utf8");
  fs.chmodSync(executable, 0o755);

  const provider = await collectProvider(
    {
      ...claudeSpec,
      commandCandidates: ["claude"],
      versionStoreCandidates: [versionsDir],
    },
    fakeRunner({
      "claude --version": { status: "not_found", stdout: "", stderr: "" },
      "claude auth status": { status: "not_found", stdout: "", stderr: "" },
      [`${executable} --version`]: ok("2.1.173 (Claude Code)"),
      [`${executable} auth status`]: ok("Authenticated"),
    })
  );

  assert.equal(provider.connected, true);
  assert.equal(provider.health, "working");
  assert.equal(provider.version, "2.1.173");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "no_stable_source");
});

test("provider collector falls back to app-bundle executables", async () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-codex-app-exec-"));
  const executable = path.join(appDir, "Contents", "Resources", "codex");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, "#!/bin/sh\n", "utf8");
  fs.chmodSync(executable, 0o755);

  const provider = await collectProvider(
    {
      ...codexSpec,
      commandCandidates: ["codex"],
      appBundleCandidates: [appDir],
      appBundleExecutableRelativePaths: ["Contents/Resources/codex"],
    },
    fakeRunner({
      "codex --version": { status: "not_found", stdout: "", stderr: "" },
      "codex login status": { status: "not_found", stdout: "", stderr: "" },
      [`${executable} --version`]: ok("codex-cli 0.138.0-alpha.7"),
      [`${executable} login status`]: ok("Logged in"),
    })
  );

  assert.equal(provider.connected, true);
  assert.equal(provider.health, "working");
  assert.equal(provider.version, "0.138.0-alpha.7");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "no_stable_source");
});

test("provider collector falls back to fixed CLI candidate paths when PATH lookup misses", async () => {
  const provider = await collectProvider(
    codexFallbackSpec,
    fakeRunner({
      "codex --version": { status: "not_found", stdout: "", stderr: "" },
      "codex login status": { status: "not_found", stdout: "", stderr: "" },
      "/tmp/aiuw-test-codex --version": ok("codex 0.139.0"),
      "/tmp/aiuw-test-codex login status": ok("Logged in"),
    })
  );

  assert.equal(provider.connected, true);
  assert.equal(provider.health, "working");
  assert.equal(provider.version, "0.139.0");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "no_stable_source");
});

test("provider collector uses app bundle version only as sanitized fallback", async () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-provider-app-test-"));
  fs.mkdirSync(path.join(appDir, "Contents"), { recursive: true });
  fs.writeFileSync(
    path.join(appDir, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleShortVersionString</key>
  <string>26.608.12217</string>
</dict>
</plist>
`,
    "utf8"
  );

  const provider = await collectProvider(
    {
      ...codexSpec,
      appBundleCandidates: [appDir],
    },
    fakeRunner({
      "codex --version": { status: "not_found", stdout: "", stderr: "" },
      "codex login status": { status: "not_found", stdout: "", stderr: "" },
    })
  );

  assert.equal(provider.connected, false);
  assert.equal(provider.health, "error");
  assert.equal(provider.version, "26.608.12217");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "collector_error");
});

test("provider collector prefers CLI version over app bundle version", async () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-provider-app-test-"));
  fs.mkdirSync(path.join(appDir, "Contents"), { recursive: true });
  fs.writeFileSync(
    path.join(appDir, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleShortVersionString</key>
  <string>26.608.12217</string>
</dict>
</plist>
`,
    "utf8"
  );

  const provider = await collectProvider(
    {
      ...codexSpec,
      appBundleCandidates: [appDir],
    },
    fakeRunner({
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
    })
  );

  assert.equal(provider.connected, true);
  assert.equal(provider.health, "working");
  assert.equal(provider.version, "0.139.0");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "no_stable_source");
});

test("provider collector does not hide real command failures behind fallback candidates", async () => {
  const provider = await collectProvider(
    codexFallbackSpec,
    fakeRunner({
      "codex --version": failed("version broke"),
      "codex login status": ok("Logged in"),
    })
  );

  assert.equal(provider.connected, false);
  assert.equal(provider.health, "error");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "collector_error");
  assert.deepEqual(provider.error, {
    code: "command_failed",
    message: "Collector command failed",
  });
  assert.equal(JSON.stringify(provider).includes("version broke"), false);
});

test("not logged in provider maps to unavailable usage without raw output", async () => {
  const provider = await collectProvider(
    codexSpec,
    fakeRunner({
      "codex --version": ok("codex 0.139.0"),
      "codex login status": failed("Not logged in as kai@example.com"),
    })
  );

  assert.equal(provider.connected, false);
  assert.equal(provider.health, "degraded");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "not_logged_in");
  assert.equal(JSON.stringify(provider).includes("kai@example.com"), false);
});

test("Codex doctor failure degrades health without leaking raw output", async () => {
  const provider = await collectProvider(
    codexDoctorSpec,
    fakeRunner({
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": {
        status: "failed",
        stdout: JSON.stringify({
          schemaVersion: 1,
          overallStatus: "fail",
          checks: {
            "auth.credentials": {
              status: "ok",
              details: {
                "auth file": "/Users/kai/.codex/auth.json",
                "stored ChatGPT tokens": "true",
              },
            },
            "terminal.env": {
              status: "fail",
              summary: "TERM=dumb",
            },
          },
        }),
        stderr: "warning with /Users/kai/private",
        exitCode: 1,
      },
    })
  );

  assert.equal(provider.connected, true);
  assert.equal(provider.health, "degraded");
  assert.equal(provider.version, "0.139.0");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "no_stable_source");
  assert.deepEqual(provider.error, {
    code: "status_probe_failed",
    message: "Status probe reported issues",
  });
  assert.equal(JSON.stringify(provider).includes("auth.json"), false);
  assert.equal(JSON.stringify(provider).includes("stored ChatGPT tokens"), false);
  assert.equal(JSON.stringify(provider).includes("/Users/kai"), false);
  assert.equal(JSON.stringify(provider).includes("TERM=dumb"), false);
});

test("Codex doctor warnings degrade health and unsupported output is ignored", async () => {
  const warningProvider = await collectProvider(
    codexDoctorSpec,
    fakeRunner({
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "warning" })),
    })
  );
  const unsupportedProvider = await collectProvider(
    codexDoctorSpec,
    fakeRunner({
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": failed("unknown command"),
    })
  );

  assert.equal(warningProvider.connected, true);
  assert.equal(warningProvider.health, "degraded");
  assert.deepEqual(warningProvider.error, {
    code: "status_probe_warning",
    message: "Status probe reported warnings",
  });
  assert.equal(unsupportedProvider.connected, true);
  assert.equal(unsupportedProvider.health, "working");
  assert.equal(unsupportedProvider.error, undefined);
});

test("Claude third-party provider route maps to no-meter usage without raw output", async () => {
  const provider = await collectProvider(
    claudeSpec,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated\nAPI provider: openrouter\nkai@example.com"),
    })
  );

  assert.equal(provider.connected, true);
  assert.equal(provider.health, "working");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "third_party_no_quota");
  assert.equal(JSON.stringify(provider).includes("openrouter"), false);
  assert.equal(JSON.stringify(provider).includes("kai@example.com"), false);
});

test("Claude first-party or ambiguous auth stays unknown usage", async () => {
  const firstParty = await collectProvider(
    claudeSpec,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok([
        "Authenticated",
        "API provider: anthropic",
        "API base URL: https://api.anthropic.com",
        "ANTHROPIC_BASE_URL=https://api.anthropic.com/v1",
      ].join("\n")),
    })
  );
  const ambiguous = await collectProvider(
    claudeSpec,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated"),
    })
  );

  assert.equal(firstParty.usage.available, false);
  assert.equal(firstParty.usage.reason, "no_stable_source");
  assert.equal(ambiguous.usage.available, false);
  assert.equal(ambiguous.usage.reason, "no_stable_source");
});

test("Claude Code TTY usage overlays first-party Claude through the snapshot contract", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.177"),
      "claude auth status": ok("Authenticated\nAPI provider: anthropic"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "ok" })),
    }),
    {
      claudeCodeTty: true,
      claudeCodeTtyCollector: async () => ({
        claude: {
          capturedAt: "2026-06-13T07:40:00.000Z",
          version: "2.1.177",
          usage: {
            available: true,
            source: "claude_code_tty",
            sourceVersion: "2.1.177",
            fiveHourRemainingPercent: 98,
            fiveHourResetAt: "2026-06-13T12:39:00.000Z",
            weeklyRemainingPercent: 100,
            weeklyResetAt: "2026-06-16T02:59:00.000Z",
          },
        },
      }),
    }
  );

  const claude = snapshot.providers.find((provider) => provider.id === "claude");
  assert.equal(claude?.usage.available, true);
  assert.equal(claude?.usage.available && claude.usage.source, "claude_code_tty");
  assert.equal(claude?.usage.available && claude.usage.fiveHourRemainingPercent, 98);
  assert.equal(claude?.usage.available && claude.usage.weeklyRemainingPercent, 100);
  assert.equal(JSON.stringify(snapshot).includes("Authenticated"), false);
});

test("Claude Code TTY mode does not run Claude auth status when no meter is captured", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.177"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "ok" })),
    }),
    {
      claudeCodeTty: true,
      claudeCodeTtyCollector: async () => ({}),
    }
  );

  const claude = snapshot.providers.find((provider) => provider.id === "claude");
  assert.equal(claude?.usage.available, false);
  assert.equal(!claude?.usage.available && claude?.usage.reason, "no_stable_source");
});

test("Claude non-first-party base URL maps to no-meter usage", async () => {
  const provider = await collectProvider(
    claudeSpec,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated\nAPI base URL: https://gateway.example.com/anthropic"),
    })
  );

  assert.equal(provider.connected, true);
  assert.equal(provider.health, "working");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "third_party_no_quota");
  assert.equal(JSON.stringify(provider).includes("gateway.example.com"), false);
});

test("Claude third-party signals do not override collector failures", async () => {
  const provider = await collectProvider(
    claudeSpec,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": failed("API provider: openrouter\ninternal failure"),
    })
  );

  assert.equal(provider.connected, false);
  assert.equal(provider.health, "error");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "collector_error");
  assert.deepEqual(provider.error, {
    code: "command_failed",
    message: "Collector command failed",
  });
  assert.equal(JSON.stringify(provider).includes("openrouter"), false);
  assert.equal(JSON.stringify(provider).includes("internal failure"), false);
});

test("collector timeout returns generic collector_error", async () => {
  const provider = await collectProvider(
    codexSpec,
    fakeRunner({
      "codex --version": ok("codex 0.139.0"),
      "codex login status": {
        status: "timeout",
        stdout: "private account text",
        stderr: "",
      },
    })
  );

  assert.equal(provider.connected, false);
  assert.equal(provider.health, "error");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "collector_error");
  assert.deepEqual(provider.error, {
    code: "timeout",
    message: "Collector command timed out",
  });
  assert.equal(JSON.stringify(provider).includes("private account text"), false);
});

test("unexpected command failure is a collector error", async () => {
  const provider = await collectProvider(
    codexSpec,
    fakeRunner({
      "codex --version": ok("codex 0.139.0"),
      "codex login status": failed("something broke"),
    })
  );

  assert.equal(provider.connected, false);
  assert.equal(provider.health, "error");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "collector_error");
  assert.deepEqual(provider.error, {
    code: "command_failed",
    message: "Collector command failed",
  });
  assert.equal(JSON.stringify(provider).includes("something broke"), false);
});

test("missing CLI is a collector error, not a fake login status", async () => {
  const provider = await collectProvider(
    codexSpec,
    fakeRunner({
      "codex --version": { status: "not_found", stdout: "", stderr: "" },
      "codex login status": { status: "not_found", stdout: "", stderr: "" },
    })
  );

  assert.equal(provider.connected, false);
  assert.equal(provider.health, "error");
  assert.equal(provider.usage.available, false);
  assert.equal(provider.usage.reason, "collector_error");
  assert.deepEqual(provider.error, {
    code: "command_not_found",
    message: "Codex CLI was not found",
  });
});

test("real snapshot builder emits only Claude and Codex through the contract", async () => {
  const snapshot = await collectCurrentSnapshot(
    config,
    fakeRunner({
      "claude --version": ok("claude 2.1.170"),
      "claude auth status": ok("Authenticated"),
      "codex --version": ok("codex 0.139.0"),
      "codex login status": ok("Logged in"),
      "codex doctor --json --summary": ok(JSON.stringify({ overallStatus: "ok" })),
    })
  );

  assert.equal(snapshot.schemaVersion, 1);
  assert.deepEqual(snapshot.providers.map((provider) => provider.id), [
    "claude",
    "codex",
  ]);
  assert.equal(snapshot.providers.every((provider) => !provider.usage.available), true);
  assert.equal(snapshot.providers.every((provider) => !("capturedAt" in provider)), true);
  assert.equal(snapshot.providers.every((provider) => !("fiveHourRemainingPercent" in provider.usage)), true);
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
