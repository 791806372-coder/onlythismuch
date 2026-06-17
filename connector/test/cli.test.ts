import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApprovalRequestPayload,
  buildApprovalStatusPayload,
  buildDoctorPayload,
  buildMissingStatusPayload,
  buildServiceInstallPayload,
  buildServiceUninstallPayload,
  buildStatusPayload,
  checkLiveConnector,
  fetchConnectorSnapshot,
  parseArgs
} from "../src/cli";
import { MAX_PAIRING_HOSTS } from "../src/network";

test("start does not enable CodexBar by default", () => {
  assert.deepEqual(parseArgs(["start"]), {
    command: "start",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
});

test("start enables CodexBar only with explicit flag", () => {
  assert.deepEqual(parseArgs(["start", "--codexbar", "--port", "9797"]), {
    command: "start",
    port: 9797,
    codexBar: true,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
});

test("start enables Claude Code TTY usage only with explicit flag", () => {
  assert.deepEqual(parseArgs(["start", "--claude-code-tty", "--port", "9797"]), {
    command: "start",
    port: 9797,
    codexBar: false,
    claudeCodeTty: true,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
});

test("mock start can still use fixture path", () => {
  assert.deepEqual(parseArgs(["start", "--mock", "fixtures/normal.json"]), {
    command: "start",
    mock: "fixtures/normal.json",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
});

test("pair can explicitly print manual full-token payload", () => {
  assert.deepEqual(parseArgs(["pair", "--manual", "--port", "9797"]), {
    command: "pair",
    port: 9797,
    codexBar: false,
    claudeCodeTty: false,
    manual: true,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
});

test("pair can print current pairing payload without rotating token", () => {
  assert.deepEqual(parseArgs(["pair", "--current", "--manual", "--port", "9797"]), {
    command: "pair",
    port: 9797,
    codexBar: false,
    claudeCodeTty: false,
    manual: true,
    currentPairing: true,
    live: false,
    quietPairing: false,
  });
});

test("start can suppress pairing output for launchd service logs", () => {
  assert.deepEqual(parseArgs(["start", "--quiet-pairing", "--port", "9797"]), {
    command: "start",
    port: 9797,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: true,
  });
});

test("status can explicitly request a live reachability check", () => {
  assert.deepEqual(parseArgs(["status", "--live", "--port", "9797"]), {
    command: "status",
    port: 9797,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: true,
    quietPairing: false,
  });
});

test("doctor can include a live reachability check", () => {
  assert.deepEqual(parseArgs(["doctor", "--live", "--port", "9797"]), {
    command: "doctor",
    port: 9797,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: true,
    quietPairing: false,
  });
});

test("snapshot command can target a connector port", () => {
  assert.deepEqual(parseArgs(["snapshot", "--port", "9797"]), {
    command: "snapshot",
    port: 9797,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
});

test("approvals command is read-only and takes no connector flags", () => {
  assert.deepEqual(parseArgs(["approvals"]), {
    command: "approvals",
    approvalAction: "status",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
  assert.deepEqual(parseArgs(["approvals", "status"]), {
    command: "approvals",
    approvalAction: "status",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
  assert.deepEqual(parseArgs(["approvals", "seed"]), {
    command: "approvals",
    approvalAction: "seed",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
  assert.deepEqual(parseArgs(["approvals", "clear"]), {
    command: "approvals",
    approvalAction: "clear",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
});

test("service commands parse explicit action and optional usage modes", () => {
  assert.deepEqual(parseArgs(["service", "plist", "--port", "9797", "--codexbar", "--claude-code-tty"]), {
    command: "service",
    serviceAction: "plist",
    port: 9797,
    codexBar: true,
    claudeCodeTty: true,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
  assert.deepEqual(parseArgs(["service", "install"]), {
    command: "service",
    serviceAction: "install",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
  assert.deepEqual(parseArgs(["service", "status"]), {
    command: "service",
    serviceAction: "status",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
  assert.deepEqual(parseArgs(["service", "uninstall"]), {
    command: "service",
    serviceAction: "uninstall",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
  assert.deepEqual(parseArgs(["service", "load"]), {
    command: "service",
    serviceAction: "load",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
  assert.deepEqual(parseArgs(["service", "unload"]), {
    command: "service",
    serviceAction: "unload",
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  });
});

test("rejects flags that do not apply to the command", () => {
  assert.throws(() => parseArgs(["status", "--manual"]), /--manual/);
  assert.throws(() => parseArgs(["status", "--current"]), /--current/);
  assert.throws(() => parseArgs(["start", "--current"]), /--current/);
  assert.throws(() => parseArgs(["pair", "--mock", "fixtures/normal.json"]), /--mock/);
  assert.throws(() => parseArgs(["status", "--codexbar"]), /--codexbar/);
  assert.throws(() => parseArgs(["status", "--claude-code-tty"]), /--claude-code-tty/);
  assert.throws(() => parseArgs(["start", "--live"]), /--live/);
  assert.throws(() => parseArgs(["pair", "--live"]), /--live/);
  assert.throws(() => parseArgs(["status", "--quiet-pairing"]), /--quiet-pairing/);
  assert.throws(() => parseArgs(["service"]), /service requires/);
  assert.throws(() => parseArgs(["service", "uninstall", "--codexbar"]), /--codexbar/);
  assert.throws(() => parseArgs(["service", "uninstall", "--claude-code-tty"]), /--claude-code-tty/);
  assert.throws(() => parseArgs(["service", "status", "--port", "9797"]), /--port/);
  assert.throws(() => parseArgs(["service", "load", "--codexbar"]), /--codexbar/);
  assert.throws(() => parseArgs(["service", "unload", "--port", "9797"]), /--port/);
  assert.throws(() => parseArgs(["approvals", "--port", "9797"]), /--port/);
  assert.throws(() => parseArgs(["approvals", "--live"]), /--live/);
  assert.throws(() => parseArgs(["approvals", "--manual"]), /--manual/);
  assert.throws(() => parseArgs(["approvals", "nope"]), /approvals requires/);
  assert.throws(() => parseArgs(["doctor", "--manual"]), /--manual/);
  assert.throws(() => parseArgs(["snapshot", "--manual"]), /--manual/);
  assert.throws(() => parseArgs(["snapshot", "--live"]), /--live/);
});

test("status payload is redacted pairing config, not live token output", () => {
  const payload = buildStatusPayload(
    {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "secret-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    8787
  );
  const serialized = JSON.stringify(payload);

  assert.equal(payload.statusKind, "pairing_config");
  assertNoRoutinePayloadLeak(serialized);
  assert.equal(payload.configPresent, true);
  assert.equal(payload.deviceConfigured, true);
  assert.equal(payload.nameConfigured, true);
  assertAddressCount(payload.addressCount);
  assert.equal(payload.port, 8787);
  assert.equal(payload.manualPairCommand, "npm run pair:manual");
  assert.equal(payload.cliManualPairCommand, "aiuw pair --port 8787 --manual");
});

test("missing status payload does not imply pairing readiness", () => {
  const payload = buildMissingStatusPayload(8787);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.ok, false);
  assert.equal(payload.statusKind, "pairing_config_missing");
  assertNoRoutinePayloadLeak(serialized);
  assert.equal(serialized.includes("/tmp/aiuw/config.json"), false);
  assert.equal(payload.configPresent, false);
  assert.deepEqual(payload.nextScripts, {
    startMock: "npm run start:mock",
    startReal: "npm run start:real",
    manualPair: "npm run pair:manual"
  });
});

test("non-default port status payload keeps direct aiuw commands", () => {
  const payload = buildMissingStatusPayload(9797);

  assert.deepEqual(payload.nextScripts, {
    startMock: "aiuw start --mock fixtures/normal.json --port 9797",
    startReal: "aiuw start --port 9797",
    manualPair: "aiuw pair --port 9797 --manual"
  });
});

test("status payload can include redacted live check details", () => {
  const payload = buildStatusPayload(
    {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "secret-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    8787,
    {
      attempted: true,
      endpoint: "/v1/ping+/v1/snapshot",
      checkedAt: "2026-06-11T00:00:01.000Z",
      serverLooksRunning: true,
      snapshotLooksValid: true,
      reachableHosts: ["10.0.0.2"],
      failedHosts: [{ host: "Test-Mac.local", error: "timeout" }],
      snapshotReadyHosts: ["10.0.0.2"],
      snapshotFailedHosts: []
    }
  );
  const serialized = JSON.stringify(payload);

  assert.equal(serialized.includes("secret-token"), false);
  assertNoRoutinePayloadLeak(serialized);
  assert.deepEqual(payload.liveCheck, {
    attempted: true,
    endpoint: "/v1/ping+/v1/snapshot",
    checkedAt: "2026-06-11T00:00:01.000Z",
    serverLooksRunning: true,
    snapshotLooksValid: true,
    reachableAddressCount: 1,
    failedAddressCount: 1,
    failedAddressErrors: [{ error: "timeout", count: 1 }],
    snapshotReadyAddressCount: 1,
    snapshotFailedAddressCount: 0,
    snapshotFailedAddressErrors: []
  });
});

test("approval status payload is bounded and token-free", () => {
  const payload = buildApprovalStatusPayload([
    {
      schemaVersion: 1,
      requestId: "fixture-approval-1",
      action: "approve",
      decidedAt: "2026-06-11T00:00:00.000Z"
    },
    {
      schemaVersion: 1,
      requestId: "fixture-approval-2",
      action: "deny",
      decidedAt: "2026-06-11T00:01:00.000Z"
    }
  ], {
    schemaVersion: 1,
    id: "fixture-pending",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z",
    expiresAt: "2026-06-11T00:15:00.000Z"
  }, 1);
  const serialized = JSON.stringify(payload);

  assert.equal(payload.statusKind, "approval_decisions");
  assert.equal(payload.count, 2);
  assert.deepEqual(payload.pendingRequest, {
    id: "fixture-pending",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z",
    expiresAt: "2026-06-11T00:15:00.000Z"
  });
  assert.deepEqual(payload.decisions, [
    {
      requestId: "fixture-approval-2",
      action: "deny",
      decidedAt: "2026-06-11T00:01:00.000Z"
    }
  ]);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("Bearer"), false);
  assert.equal(serialized.includes("Authorization"), false);
  assert.equal(serialized.includes("transcript"), false);
  assert.equal(serialized.includes("raw"), false);
});

test("approval request payload is bounded and token-free", () => {
  const payload = buildApprovalRequestPayload("seed", {
    schemaVersion: 1,
    id: "fixture-pending",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z",
    expiresAt: "2026-06-11T00:15:00.000Z"
  });
  const serialized = JSON.stringify(payload);

  assert.equal(payload.statusKind, "approval_request");
  assert.equal(payload.action, "seed");
  assert.match(serialized, /fixture-pending/);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("Bearer"), false);
  assert.equal(serialized.includes("Authorization"), false);
  assert.equal(serialized.includes("transcript"), false);
  assert.equal(serialized.includes("raw output"), false);
});

test("doctor payload summarizes connector setup without secrets", () => {
  const payload = buildDoctorPayload({
    config: {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "secret-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    port: 8787,
    serviceStatus: serviceStatus({
      plistExists: true,
      loaded: true,
      running: true
    }),
    liveCheck: {
      attempted: true,
      endpoint: "/v1/ping+/v1/snapshot",
      checkedAt: "2026-06-11T00:00:01.000Z",
      serverLooksRunning: true,
      snapshotLooksValid: true,
      reachableHosts: ["10.0.0.2"],
      failedHosts: [],
      snapshotReadyHosts: ["10.0.0.2"],
      snapshotFailedHosts: []
    }
  });
  const serialized = JSON.stringify(payload);

  assert.equal(payload.statusKind, "connector_doctor");
  assert.equal(payload.readyForIPhonePairing, true);
  assert.match(serialized, /Pair the iPhone/);
  assertNoRoutinePayloadLeak(serialized);
  assert.equal(serialized.includes("/tmp/aiuw/config.json"), false);
  assert.equal(serialized.includes("/Users/tester"), false);
  assert.equal(serialized.includes("10.0.0.2"), false);
  assertAddressCount((payload.pairing as { addressCount: number }).addressCount);
});

test("doctor payload gives setup actions when config and service are missing", () => {
  const payload = buildDoctorPayload({
    config: undefined,
    port: 8787,
    serviceStatus: serviceStatus({
      plistExists: false,
      loaded: false,
      running: false
    })
  });
  const serialized = JSON.stringify(payload);

  assert.equal(payload.readyForIPhonePairing, false);
  assert.match(serialized, /npm run start:mock/);
  assert.match(serialized, /npm run connector:service:install/);
  assertNoRoutinePayloadLeak(serialized);
  assert.equal(serialized.includes("/tmp/aiuw/config.json"), false);
});

test("doctor payload flags stale LaunchAgent paths", () => {
  const payload = buildDoctorPayload({
    config: {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "secret-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    port: 8787,
    serviceStatus: serviceStatus({
      plistExists: true,
      loaded: false,
      running: false,
      programDetail: "cli_path_missing"
    })
  });
  const serialized = JSON.stringify(payload);

  assert.equal(payload.readyForIPhonePairing, false);
  assert.match(serialized, /refresh the LaunchAgent Node\/CLI paths/);
  assert.match(serialized, /cli_path_missing/);
  assertNoRoutinePayloadLeak(serialized);
  assert.equal(serialized.includes("/tmp/aiuw/config.json"), false);
  assert.equal(serialized.includes("/Users/tester"), false);
});

test("service payloads point to npm scripts without local paths or launchctl shell strings", () => {
  const paths = {
    plistPath: "/Users/tester/Library/LaunchAgents/com.aiuw.connector.plist",
    logPath: "/Users/tester/Library/Logs/AIUsageWidget/connector.log",
    errorLogPath: "/Users/tester/Library/Logs/AIUsageWidget/connector-error.log"
  };
  const installPayload = buildServiceInstallPayload(paths);
  const uninstallPayload = buildServiceUninstallPayload(paths);
  const serialized = JSON.stringify({ installPayload, uninstallPayload });

  assert.equal(serialized.includes("launchctl"), false);
  assert.equal(serialized.includes("bootstrap"), false);
  assert.equal(serialized.includes("bootout"), false);
  assert.equal(serialized.includes("/Users/tester"), false);
  assert.equal(serialized.includes("plistPath"), false);
  assert.equal(serialized.includes("logPath"), false);
  assert.deepEqual(installPayload.nextScripts, {
    load: "connector:service:load",
    unload: "connector:service:unload",
    uninstall: "connector:service:uninstall"
  });
  assert.deepEqual(uninstallPayload.nextScripts, {
    unload: "connector:service:unload"
  });
});

test("live status probe reports reachable and failed hosts without returning token", async () => {
  const seenAuthHeaders: string[] = [];
  const result = await checkLiveConnector(
    {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "secret-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    8787,
    ["10.0.0.2", "Test-Mac.local"],
    async (url, init) => {
      seenAuthHeaders.push(init.headers.authorization);
      if (url.includes("10.0.0.2") && url.endsWith("/v1/ping")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true })
        };
      }
      if (url.includes("10.0.0.2") && url.endsWith("/v1/snapshot")) {
        return {
          ok: true,
          status: 200,
          json: async () => validSnapshot()
        };
      }
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthorized" })
      };
    }
  );

  assert.deepEqual(result.reachableHosts, ["10.0.0.2"]);
  assert.deepEqual(result.failedHosts, [{ host: "Test-Mac.local", error: "HTTP 401" }]);
  assert.deepEqual(result.snapshotReadyHosts, ["10.0.0.2"]);
  assert.deepEqual(result.snapshotFailedHosts, []);
  assert.equal(result.serverLooksRunning, true);
  assert.equal(result.snapshotLooksValid, true);
  assert.deepEqual(seenAuthHeaders, ["Bearer secret-token", "Bearer secret-token", "Bearer secret-token"]);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

test("live status probe separates snapshot failures from ping reachability", async () => {
  const result = await checkLiveConnector(
    {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "secret-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    8787,
    ["10.0.0.2"],
    async (url) => {
      if (url.endsWith("/v1/ping")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true })
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ schemaVersion: 1, providers: [] })
      };
    }
  );

  assert.equal(result.serverLooksRunning, true);
  assert.equal(result.snapshotLooksValid, false);
  assert.deepEqual(result.reachableHosts, ["10.0.0.2"]);
  assert.deepEqual(result.snapshotReadyHosts, []);
  assert.deepEqual(result.snapshotFailedHosts, [{ host: "10.0.0.2", error: "invalid snapshot" }]);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

test("live status probe sanitizes thrown transport errors", async () => {
  const result = await checkLiveConnector(
    {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "secret-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    8787,
    ["Test-Mac.local"],
    async () => {
      throw new Error("Bearer secret-token Authorization apiToken cookie transcript raw provider output");
    }
  );
  const serialized = JSON.stringify(result);

  assert.deepEqual(result.failedHosts, [{ host: "Test-Mac.local", error: "request_failed" }]);
  assert.equal(result.snapshotLooksValid, false);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("Bearer"), false);
  assert.equal(serialized.includes("Authorization"), false);
  assert.equal(serialized.includes("apiToken"), false);
  assert.equal(serialized.includes("transcript"), false);
  assert.equal(serialized.includes("provider output"), false);
});

test("snapshot command fetch returns only validated snapshot", async () => {
  const seenAuthHeaders: string[] = [];
  const snapshot = await fetchConnectorSnapshot(
    {
      version: 1,
      deviceId: "mac-test",
      name: "Test Mac",
      token: "secret-token",
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    8787,
    ["10.0.0.2"],
    async (_url, init) => {
      seenAuthHeaders.push(init.headers.authorization);
      return {
        ok: true,
        status: 200,
        json: async () => validSnapshot()
      };
    }
  );

  assert.equal(snapshot.schemaVersion, 1);
  assert.deepEqual(seenAuthHeaders, ["Bearer secret-token"]);
  assert.equal(JSON.stringify(snapshot).includes("secret-token"), false);
});

test("snapshot command failure summary does not leak host or token details", async () => {
  await assert.rejects(
    () => fetchConnectorSnapshot(
      {
        version: 1,
        deviceId: "mac-test",
        name: "Test Mac",
        token: "secret-token",
        updatedAt: "2026-06-11T00:00:00.000Z"
      },
      8787,
      ["Test-Mac.local"],
      async () => {
        throw new Error("Bearer secret-token Authorization apiToken cookie transcript raw provider output");
      }
    ),
    (error) => {
      const message = String(error);
      assert.match(message, /snapshot unavailable/);
      assert.equal(message.includes("secret-token"), false);
      assert.equal(message.includes("Bearer"), false);
      assert.equal(message.includes("Authorization"), false);
      assert.equal(message.includes("Test-Mac.local"), false);
      return true;
    }
  );
});

function validSnapshot() {
  return {
    schemaVersion: 1,
    device: {
      id: "mac-test",
      name: "Test Mac",
      platform: "macOS",
      connectorVersion: "0.1.0",
      online: true,
      updatedAt: "2026-06-11T00:00:00.000Z"
    },
    providers: [
      {
        id: "claude",
        displayName: "Claude",
        connected: true,
        health: "working",
        version: "2.1.173",
        usage: {
          available: false,
          reason: "no_stable_source"
        }
      },
      {
        id: "codex",
        displayName: "Codex",
        connected: true,
        health: "working",
        version: "0.139.0",
        usage: {
          available: false,
          reason: "no_stable_source"
        }
      }
    ]
  };
}

function serviceStatus(input: {
  plistExists: boolean;
  loaded: boolean;
  running: boolean;
  programDetail?:
    | "not_installed"
    | "plist_unreadable"
    | "program_arguments_missing"
    | "node_path_missing"
    | "cli_path_missing"
    | "unexpected_command"
    | "paths_ok";
}) {
  const detail = input.programDetail ?? (input.plistExists ? "paths_ok" : "not_installed");
  return {
    label: "com.aiuw.connector" as const,
    plistPath: "/Users/tester/Library/LaunchAgents/com.aiuw.connector.plist",
    plistExists: input.plistExists,
    ...(input.plistExists ? { plistMode: "0600" } : {}),
    logPath: "/Users/tester/Library/Logs/AIUsageWidget/connector.log",
    errorLogPath: "/Users/tester/Library/Logs/AIUsageWidget/connector-error.log",
    program: {
      argumentsFound: detail !== "not_installed" && detail !== "plist_unreadable" && detail !== "program_arguments_missing",
      nodePathExists: detail === "not_installed" || detail === "plist_unreadable" || detail === "program_arguments_missing"
        ? null
        : detail !== "node_path_missing",
      cliPathExists: detail === "not_installed" || detail === "plist_unreadable" || detail === "program_arguments_missing"
        ? null
        : detail !== "cli_path_missing",
      startCommandLooksValid: detail !== "not_installed" &&
        detail !== "plist_unreadable" &&
        detail !== "program_arguments_missing" &&
        detail !== "unexpected_command",
      detail
    },
    launchctl: {
      checked: true as const,
      loaded: input.loaded,
      running: input.running,
      detail: input.loaded ? "loaded" as const : "not_loaded_or_unavailable" as const,
      ...(input.loaded ? {} : { error: "not loaded" })
    }
  };
}

function assertAddressCount(value: unknown): void {
  assert.equal(typeof value, "number");
  const count = value as number;
  assert(count > 0);
  assert(count <= MAX_PAIRING_HOSTS);
}

function assertNoRoutinePayloadLeak(serialized: string) {
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("\"token\":"), false);
  assert.equal(serialized.includes("Bearer"), false);
  assert.equal(serialized.includes("Authorization"), false);
  assert.equal(serialized.includes("cookie"), false);
  assert.equal(serialized.includes("transcript"), false);
  assert.equal(serialized.includes("provider output"), false);
  assert.equal(serialized.includes("\"hosts\":"), false);
  assert.equal(serialized.includes("\"host\":"), false);
  assert.equal(serialized.includes("\"configPath\""), false);
  assert.equal(serialized.includes("\"deviceId\""), false);
  assert.equal(serialized.includes("\"name\":\"Test Mac\""), false);
  assert.equal(serialized.includes("10.0.0.2"), false);
  assert.equal(serialized.includes("Test-Mac.local"), false);
}
