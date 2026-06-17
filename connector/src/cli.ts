#!/usr/bin/env node
import type { Server } from "node:http";
import { loadStoredApprovalDecisions, type StoredApprovalDecision } from "./approval";
import {
  clearPendingApprovalRequest,
  loadPendingApprovalRequest,
  seedPendingApprovalRequest,
  type ApprovalRequest,
} from "./approval";
import { collectCurrentSnapshot } from "./collectors";
import { getConfigPaths, loadConfig, loadOrCreateConfig, rotateToken } from "./config";
import {
  buildLaunchctlArgs,
  buildLaunchdPlist,
  getLaunchdPaths,
  inspectLaunchdService,
  type LaunchdServiceStatus,
  type LaunchdPaths,
  removeLaunchdPlist,
  runLaunchctl,
  writeLaunchdPlist,
} from "./launchd";
import { buildPairingPayload, renderPairingPayload } from "./pairing";
import { startConnectorServer } from "./server";
import {
  loadCachedSnapshot,
  loadMockSnapshot,
  saveCachedSnapshot,
  snapshotPreservingLastKnownUsage,
} from "./snapshot";
import { parseSnapshot, type Snapshot } from "../../src/contract/schema";

const CLAUDE_CODE_TTY_REFRESH_MS = 5 * 60 * 1000;

type ParsedArgs = {
  command?: string;
  approvalAction?: "status" | "seed" | "clear";
  serviceAction?: "plist" | "install" | "status" | "load" | "unload" | "uninstall";
  mock?: string;
  port: number;
  codexBar: boolean;
  claudeCodeTty: boolean;
  manual: boolean;
  currentPairing: boolean;
  live: boolean;
  quietPairing: boolean;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: argv[0],
    port: 8787,
    codexBar: false,
    claudeCodeTty: false,
    manual: false,
    currentPairing: false,
    live: false,
    quietPairing: false,
  };
  let startIndex = 1;

  if (parsed.command === "approvals") {
    const hasExplicitApprovalAction = Boolean(argv[1] && !argv[1].startsWith("--"));
    const approvalAction = hasExplicitApprovalAction ? argv[1] : "status";
    if (
      approvalAction !== "status" &&
      approvalAction !== "seed" &&
      approvalAction !== "clear"
    ) {
      throw new Error("aiuw approvals requires status, seed, or clear");
    }
    parsed.approvalAction = approvalAction;
    startIndex = hasExplicitApprovalAction ? 2 : 1;
  }

  if (parsed.command === "service") {
    const serviceAction = argv[1];
    if (
      serviceAction !== "plist" &&
      serviceAction !== "install" &&
      serviceAction !== "status" &&
      serviceAction !== "load" &&
      serviceAction !== "unload" &&
      serviceAction !== "uninstall"
    ) {
      throw new Error("aiuw service requires plist, install, status, load, unload, or uninstall");
    }
    parsed.serviceAction = serviceAction;
    startIndex = 2;
  }

  for (let index = startIndex; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mock") {
      if (parsed.command !== "start") {
        throw new Error("--mock can only be used with aiuw start");
      }
      parsed.mock = argv[index + 1];
      index += 1;
    } else if (arg === "--port") {
      if (
        !["start", "pair", "status", "doctor", "snapshot"].includes(parsed.command ?? "") &&
        !(parsed.command === "service" && (parsed.serviceAction === "plist" || parsed.serviceAction === "install"))
      ) {
        throw new Error("--port can only be used with aiuw start, pair, status, doctor, or service plist/install");
      }
      const port = Number(argv[index + 1]);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error("Port must be an integer from 1 to 65535");
      }
      parsed.port = port;
      index += 1;
    } else if (arg === "--codexbar") {
      if (
        parsed.command !== "start" &&
        !(parsed.command === "service" && (parsed.serviceAction === "plist" || parsed.serviceAction === "install"))
      ) {
        throw new Error("--codexbar can only be used with aiuw start or aiuw service plist/install");
      }
      parsed.codexBar = true;
    } else if (arg === "--claude-code-tty") {
      if (
        parsed.command !== "start" &&
        !(parsed.command === "service" && (parsed.serviceAction === "plist" || parsed.serviceAction === "install"))
      ) {
        throw new Error("--claude-code-tty can only be used with aiuw start or aiuw service plist/install");
      }
      parsed.claudeCodeTty = true;
    } else if (arg === "--manual") {
      if (parsed.command !== "start" && parsed.command !== "pair") {
        throw new Error("--manual can only be used with aiuw start or aiuw pair");
      }
      parsed.manual = true;
    } else if (arg === "--current") {
      if (parsed.command !== "pair") {
        throw new Error("--current can only be used with aiuw pair");
      }
      parsed.currentPairing = true;
    } else if (arg === "--live") {
      if (parsed.command !== "status" && parsed.command !== "doctor") {
        throw new Error("--live can only be used with aiuw status or aiuw doctor");
      }
      parsed.live = true;
    } else if (arg === "--quiet-pairing") {
      if (parsed.command !== "start") {
        throw new Error("--quiet-pairing can only be used with aiuw start");
      }
      parsed.quietPairing = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

type LiveFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type LiveFetch = (
  url: string,
  init: { headers: { authorization: string }; signal: AbortSignal }
) => Promise<LiveFetchResponse>;

export type LiveCheckResult = {
  attempted: true;
  endpoint: "/v1/ping+/v1/snapshot";
  checkedAt: string;
  serverLooksRunning: boolean;
  snapshotLooksValid: boolean;
  reachableHosts: string[];
  failedHosts: Array<{
    host: string;
    error: string;
  }>;
  snapshotReadyHosts: string[];
  snapshotFailedHosts: Array<{
    host: string;
    error: string;
  }>;
};

type PublicLiveCheck = {
  attempted: true;
  endpoint: "/v1/ping+/v1/snapshot";
  checkedAt: string;
  serverLooksRunning: boolean;
  snapshotLooksValid: boolean;
  reachableAddressCount: number;
  failedAddressCount: number;
  failedAddressErrors: Array<{ error: string; count: number }>;
  snapshotReadyAddressCount: number;
  snapshotFailedAddressCount: number;
  snapshotFailedAddressErrors: Array<{ error: string; count: number }>;
};

const LIVE_CHECK_TIMEOUT_MS = 1_200;

function liveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "timeout";
    }
  }
  return "request_failed";
}

async function checkLiveHost(
  host: string,
  port: number,
  token: string,
  fetchFn: LiveFetch
): Promise<
  | { host: string; ok: true; snapshotOk: true }
  | { host: string; ok: true; snapshotOk: false; snapshotError: string }
  | { host: string; ok: false; error: string }
> {
  try {
    const headers = { authorization: `Bearer ${token}` };
    const pingResponse = await fetchFn(`http://${host}:${port}/v1/ping`, {
      headers,
      signal: AbortSignal.timeout(LIVE_CHECK_TIMEOUT_MS)
    });
    if (!pingResponse.ok) {
      return { host, ok: false, error: `HTTP ${pingResponse.status}` };
    }

    const pingBody = await pingResponse.json();
    if (!(typeof pingBody === "object" && pingBody !== null && "ok" in pingBody && pingBody.ok === true)) {
      return { host, ok: false, error: "unexpected ping response" };
    }

    let snapshotResponse: LiveFetchResponse;
    try {
      snapshotResponse = await fetchFn(`http://${host}:${port}/v1/snapshot`, {
        headers,
        signal: AbortSignal.timeout(LIVE_CHECK_TIMEOUT_MS)
      });
    } catch (error) {
      return { host, ok: true, snapshotOk: false, snapshotError: liveErrorMessage(error) };
    }
    if (!snapshotResponse.ok) {
      return { host, ok: true, snapshotOk: false, snapshotError: `HTTP ${snapshotResponse.status}` };
    }

    try {
      parseSnapshot(await snapshotResponse.json());
      return { host, ok: true, snapshotOk: true };
    } catch {
      return { host, ok: true, snapshotOk: false, snapshotError: "invalid snapshot" };
    }
  } catch (error) {
    return { host, ok: false, error: liveErrorMessage(error) };
  }
}

export async function checkLiveConnector(
  config: ReturnType<typeof loadOrCreateConfig>,
  port: number,
  hosts = buildPairingPayload(config, port).hosts,
  fetchFn: LiveFetch = (url, init) => fetch(url, init)
): Promise<LiveCheckResult> {
  const results = await Promise.all(
    hosts.map((host) => checkLiveHost(host, port, config.token, fetchFn))
  );
  const reachableHosts = results.filter((result) => result.ok).map((result) => result.host);
  const snapshotReadyHosts = results
    .filter((result): result is { host: string; ok: true; snapshotOk: true } => result.ok && result.snapshotOk)
    .map((result) => result.host);
  const failedHosts = results
    .filter((result): result is { host: string; ok: false; error: string } => !result.ok)
    .map(({ host, error }) => ({ host, error }));
  const snapshotFailedHosts = results
    .filter((result): result is { host: string; ok: true; snapshotOk: false; snapshotError: string } => result.ok && !result.snapshotOk)
    .map(({ host, snapshotError }) => ({ host, error: snapshotError }));

  return {
    attempted: true,
    endpoint: "/v1/ping+/v1/snapshot",
    checkedAt: new Date().toISOString(),
    serverLooksRunning: reachableHosts.length > 0,
    snapshotLooksValid: snapshotReadyHosts.length > 0,
    reachableHosts,
    failedHosts,
    snapshotReadyHosts,
    snapshotFailedHosts
  };
}

export async function fetchConnectorSnapshot(
  config: ReturnType<typeof loadOrCreateConfig>,
  port: number,
  hosts = buildPairingPayload(config, port).hosts,
  fetchFn: LiveFetch = (url, init) => fetch(url, init)
): Promise<Snapshot> {
  const errors: Array<{ error: string }> = [];

  for (const host of hosts) {
    try {
      const response = await fetchFn(`http://${host}:${port}/v1/snapshot`, {
        headers: { authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(LIVE_CHECK_TIMEOUT_MS)
      });
      if (!response.ok) {
        errors.push({ error: `HTTP ${response.status}` });
        continue;
      }
      try {
        return parseSnapshot(await response.json());
      } catch {
        errors.push({ error: "invalid snapshot" });
      }
    } catch (error) {
      errors.push({ error: liveErrorMessage(error) });
    }
  }

  const summary = summarizeErrors(errors)
    .map((item) => `${item.error} x${item.count}`)
    .join(", ");
  throw new Error(`snapshot unavailable${summary ? `: ${summary}` : ""}`);
}

function summarizeErrors(items: Array<{ error: string }>): Array<{ error: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.error, (counts.get(item.error) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([error, count]) => ({ error, count }));
}

export function buildPublicLiveCheck(liveCheck: LiveCheckResult): PublicLiveCheck {
  return {
    attempted: true,
    endpoint: liveCheck.endpoint,
    checkedAt: liveCheck.checkedAt,
    serverLooksRunning: liveCheck.serverLooksRunning,
    snapshotLooksValid: liveCheck.snapshotLooksValid,
    reachableAddressCount: liveCheck.reachableHosts.length,
    failedAddressCount: liveCheck.failedHosts.length,
    failedAddressErrors: summarizeErrors(liveCheck.failedHosts),
    snapshotReadyAddressCount: liveCheck.snapshotReadyHosts.length,
    snapshotFailedAddressCount: liveCheck.snapshotFailedHosts.length,
    snapshotFailedAddressErrors: summarizeErrors(liveCheck.snapshotFailedHosts),
  };
}

export function buildApprovalStatusPayload(
  decisions: StoredApprovalDecision[],
  pendingRequest?: ApprovalRequest,
  limit = 20
): Record<string, unknown> {
  const boundedDecisions = decisions.slice(-limit).map((decision) => ({
    requestId: decision.requestId,
    action: decision.action,
    decidedAt: decision.decidedAt
  }));

  return {
    ok: true,
    statusKind: "approval_decisions",
    count: decisions.length,
    pendingRequest: pendingRequest ? {
      id: pendingRequest.id,
      source: pendingRequest.source,
      title: pendingRequest.title,
      createdAt: pendingRequest.createdAt,
      expiresAt: pendingRequest.expiresAt ?? null
    } : null,
    decisions: boundedDecisions,
    note: "Approval summaries contain only request id, action, and timestamp."
  };
}

export function buildApprovalRequestPayload(
  action: "seed" | "clear",
  request?: ApprovalRequest
): Record<string, unknown> {
  return {
    ok: true,
    statusKind: "approval_request",
    action,
    pendingRequest: request ? {
      id: request.id,
      source: request.source,
      title: request.title,
      createdAt: request.createdAt,
      expiresAt: request.expiresAt ?? null
    } : null,
    note: "Pending approval request metadata is bounded and excludes private provider details."
  };
}

export function buildStatusPayload(
  config: ReturnType<typeof loadOrCreateConfig>,
  port: number,
  liveCheck?: LiveCheckResult
): Record<string, unknown> {
  const payload = buildPairingPayload(config, port);
  return {
    ok: true,
    statusKind: "pairing_config",
    configPresent: true,
    deviceConfigured: Boolean(config.deviceId),
    nameConfigured: Boolean(config.name),
    updatedAt: config.updatedAt,
    port,
    addressCount: payload.hosts.length,
    manualPairCommand: manualPairCommand(port),
    cliManualPairCommand: `aiuw pair --port ${port} --manual`,
    manualPairNote: "Manual pairing rotates the bearer token and invalidates older pairings.",
    ...(liveCheck ? { liveCheck: buildPublicLiveCheck(liveCheck) } : {})
  };
}

export function buildMissingStatusPayload(
  port: number
): Record<string, unknown> {
  return {
    ok: false,
    statusKind: "pairing_config_missing",
    configPresent: false,
    port,
    nextScripts: {
      startMock: port === 8787 ? "npm run start:mock" : `aiuw start --mock fixtures/normal.json --port ${port}`,
      startReal: port === 8787 ? "npm run start:real" : `aiuw start --port ${port}`,
      manualPair: manualPairCommand(port)
    },
    note: "No pairing config exists yet; start the connector or run manual pairing before scanning on iPhone."
  };
}

export function buildDoctorPayload(input: {
  config: ReturnType<typeof loadConfig>;
  port: number;
  serviceStatus: LaunchdServiceStatus;
  liveCheck?: LiveCheckResult;
}): Record<string, unknown> {
  const pairing = input.config
    ? {
        present: true,
        deviceConfigured: Boolean(input.config.deviceId),
        nameConfigured: Boolean(input.config.name),
        updatedAt: input.config.updatedAt,
        port: input.port,
        addressCount: buildPairingPayload(input.config, input.port).hosts.length,
        manualPairCommand: manualPairCommand(input.port),
        cliManualPairCommand: `aiuw pair --port ${input.port} --manual`
      }
    : {
        present: false,
        port: input.port
      };
  const nextActions: string[] = [];

  if (!input.config) {
    nextActions.push("Run `npm run start:mock` for QR pairing, or `npm run pair:manual` for paste fallback.");
  }
  if (!input.serviceStatus.plistExists) {
    nextActions.push("Run `npm run connector:service:install` when you want the connector to start at login.");
  } else if (input.serviceStatus.program.detail !== "paths_ok") {
    nextActions.push("Run `npm run connector:service:install` to refresh the LaunchAgent Node/CLI paths, then `npm run connector:service:load`.");
  } else if (!input.serviceStatus.launchctl.loaded) {
    nextActions.push("Run `npm run connector:service:load` to load the installed LaunchAgent.");
  } else if (!input.serviceStatus.launchctl.running) {
    nextActions.push("Run `npm run connector:service:status` and inspect connector logs.");
  }
  if (input.config && !input.liveCheck) {
    nextActions.push("Run `npm run connector:doctor:live` while the connector is running to prove authenticated ping and snapshot.");
  }
  if (input.liveCheck && !input.liveCheck.snapshotLooksValid) {
    nextActions.push("Start or reload the connector with `npm run start:mock` or `npm run start:real`, then rerun live doctor.");
  }
  if (input.liveCheck?.snapshotLooksValid) {
    nextActions.push("Pair the iPhone, tap 刷新 Usage, then add the medium widget.");
  }

  return {
    ok: true,
    statusKind: "connector_doctor",
    checkedAt: new Date().toISOString(),
    readyForIPhonePairing: Boolean(input.liveCheck?.snapshotLooksValid),
    pairing,
    service: buildPublicServiceStatus(input.serviceStatus),
    ...(input.liveCheck ? { liveCheck: buildPublicLiveCheck(input.liveCheck) } : {}),
    nextActions,
    note: "Doctor output is token-free. Use the manual pair command only when you intentionally need a pasteable bearer-token payload."
  };
}

export function buildPublicServiceStatus(status: LaunchdServiceStatus): Record<string, unknown> {
  return {
    label: status.label,
    plistInstalled: status.plistExists,
    plistMode: status.plistMode ?? null,
    logsConfigured: Boolean(status.logPath && status.errorLogPath),
    loaded: status.launchctl.loaded,
    running: status.launchctl.running,
    detail: status.launchctl.detail,
    program: status.program
  };
}

function manualPairCommand(port: number): string {
  return port === 8787
    ? "npm run pair:manual"
    : `aiuw pair --port ${port} --manual`;
}

export function buildServiceInstallPayload(paths: LaunchdPaths): Record<string, unknown> {
  return {
    ok: true,
    serviceKind: "launchd_plist",
    plistInstalled: Boolean(paths.plistPath),
    logsConfigured: Boolean(paths.logPath && paths.errorLogPath),
    nextScripts: {
      load: "connector:service:load",
      unload: "connector:service:unload",
      uninstall: "connector:service:uninstall"
    },
    note: "The plist starts aiuw with --quiet-pairing so pairing tokens are not written to service logs."
  };
}

export function buildServiceUninstallPayload(paths: LaunchdPaths): Record<string, unknown> {
  return {
    ok: true,
    serviceKind: "launchd_plist",
    plistRemoved: Boolean(paths.plistPath),
    nextScripts: {
      unload: "connector:service:unload"
    },
    note: "Uninstall makes a best-effort unload first, then removes the known plist path."
  };
}

function printHelp(): void {
  console.log(`Usage:
  aiuw start [--mock <fixture>] [--codexbar] [--claude-code-tty] [--port 8787] [--manual] [--quiet-pairing]
  aiuw pair [--port 8787] [--manual] [--current]
  aiuw snapshot [--port 8787]
  aiuw status [--port 8787] [--live]
  aiuw doctor [--port 8787] [--live]
  aiuw approvals [status|seed|clear]
  aiuw service plist [--port 8787] [--codexbar] [--claude-code-tty]
  aiuw service install [--port 8787] [--codexbar] [--claude-code-tty]
  aiuw service status
  aiuw service load
  aiuw service unload
  aiuw service uninstall
`);
}

function keepServerAlive(server: Server): Promise<void> {
  return new Promise((resolve) => {
    const keepAliveTimer = setInterval(() => {
      // Keep the connector daemon pinned even when no client is connected.
    }, 60 * 60 * 1000);
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      clearInterval(keepAliveTimer);
      server.close(() => resolve());
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (!args.command || args.command === "help" || args.command === "--help") {
    printHelp();
    return;
  }

  if (args.command === "start") {
    const configPaths = getConfigPaths();
    const config = loadOrCreateConfig(configPaths);
    const cachedSnapshot = loadCachedSnapshot(configPaths);
    let lastClaudeCodeTtyAttemptAt = 0;
    const shouldCollectClaudeCodeTty = (): boolean => {
      if (!args.claudeCodeTty) {
        return false;
      }

      const now = Date.now();
      if (
        lastClaudeCodeTtyAttemptAt > 0 &&
        now - lastClaudeCodeTtyAttemptAt < CLAUDE_CODE_TTY_REFRESH_MS
      ) {
        return false;
      }

      lastClaudeCodeTtyAttemptAt = now;
      return true;
    };
    const collectFullSnapshot = async (previous: Snapshot | undefined): Promise<Snapshot> =>
      snapshotPreservingLastKnownUsage(
        await collectCurrentSnapshot(loadOrCreateConfig(configPaths), undefined, {
          codexBar: args.codexBar,
          codexAppServer: true,
          claudeCodeTty: shouldCollectClaudeCodeTty(),
        }),
        previous
      );
    let snapshot = args.mock
      ? loadMockSnapshot(args.mock)
      : cachedSnapshot ?? await collectCurrentSnapshot(config, undefined, {
          codexBar: args.codexBar,
          codexAppServer: true,
          claudeCodeTty: false,
        });
    if (!args.mock) {
      saveCachedSnapshot(snapshot, configPaths);
    }
    const payload = buildPairingPayload(config, args.port);

    if (!args.mock) {
      const scheduleSnapshotRefresh = () => {
        const timer = setTimeout(async () => {
          try {
            snapshot = await collectFullSnapshot(snapshot);
            saveCachedSnapshot(snapshot, configPaths);
          } catch {
            // Keep serving the last sanitized snapshot if a refresh fails.
          } finally {
            scheduleSnapshotRefresh();
          }
        }, 60_000);
        timer.unref();
      };
      scheduleSnapshotRefresh();
      setTimeout(async () => {
        try {
          snapshot = await collectFullSnapshot(snapshot);
          saveCachedSnapshot(snapshot, configPaths);
        } catch {
          // Keep serving the boot snapshot until the scheduled refresh succeeds.
        }
      }, 1_000).unref();
    }

    if (!args.quietPairing) {
      renderPairingPayload(payload, { manual: args.manual });
    }
    const server = await startConnectorServer({
      config,
      snapshot,
      port: args.port,
      getAuthToken: () => loadOrCreateConfig().token,
      getSnapshot: () => snapshot
    });
    await keepServerAlive(server);
    return;
  }

  if (args.command === "pair") {
    const config = args.currentPairing ? loadOrCreateConfig() : rotateToken();
    renderPairingPayload(buildPairingPayload(config, args.port), { manual: args.manual });
    return;
  }

  if (args.command === "snapshot") {
    const config = loadConfig(getConfigPaths());
    if (!config) {
      throw new Error("snapshot unavailable: pairing config missing");
    }
    console.log(JSON.stringify(await fetchConnectorSnapshot(config, args.port), null, 2));
    return;
  }

  if (args.command === "status") {
    const paths = getConfigPaths();
    const config = loadConfig(paths);
    if (!config) {
      console.log(JSON.stringify(buildMissingStatusPayload(args.port), null, 2));
      return;
    }
    const liveCheck = args.live ? await checkLiveConnector(config, args.port) : undefined;
    console.log(JSON.stringify(buildStatusPayload(config, args.port, liveCheck), null, 2));
    return;
  }

  if (args.command === "doctor") {
    const paths = getConfigPaths();
    const config = loadConfig(paths);
    const liveCheck = args.live && config ? await checkLiveConnector(config, args.port) : undefined;
    console.log(JSON.stringify(buildDoctorPayload({
      config,
      port: args.port,
      serviceStatus: await inspectLaunchdService(),
      liveCheck
    }), null, 2));
    return;
  }

  if (args.command === "approvals") {
    if (args.approvalAction === "seed") {
      console.log(JSON.stringify(buildApprovalRequestPayload("seed", seedPendingApprovalRequest()), null, 2));
      return;
    }
    if (args.approvalAction === "clear") {
      clearPendingApprovalRequest();
      console.log(JSON.stringify(buildApprovalRequestPayload("clear"), null, 2));
      return;
    }
    console.log(JSON.stringify(buildApprovalStatusPayload(
      loadStoredApprovalDecisions(),
      loadPendingApprovalRequest()
    ), null, 2));
    return;
  }

  if (args.command === "service") {
    if (args.serviceAction === "plist") {
      console.log(buildLaunchdPlist({
        port: args.port,
        codexBar: args.codexBar,
        claudeCodeTty: args.claudeCodeTty,
      }));
      return;
    }

    if (args.serviceAction === "install") {
      const paths = writeLaunchdPlist({
        port: args.port,
        codexBar: args.codexBar,
        claudeCodeTty: args.claudeCodeTty,
      });
      console.log(JSON.stringify(buildServiceInstallPayload(paths), null, 2));
      return;
    }

    if (args.serviceAction === "status") {
      const status = await inspectLaunchdService();
      console.log(JSON.stringify({
        ok: true,
        serviceKind: "launchd_service",
        status: buildPublicServiceStatus(status),
        statusLiveCommand: "aiuw status --live",
        note: "This summary does not include launchctl raw output, pairing tokens, snapshots, or provider output."
      }, null, 2));
      return;
    }

    if (args.serviceAction === "load") {
      const paths = getLaunchdPaths();
      await runLaunchctl(buildLaunchctlArgs("load", paths));
      await runLaunchctl(buildLaunchctlArgs("kickstart", paths));
      console.log(JSON.stringify({
        ok: true,
        serviceKind: "launchd_service",
        action: "load",
        plistInstalled: true,
        serviceStatusCommand: "aiuw service status",
        connectorLiveCommand: "aiuw status --live"
      }, null, 2));
      return;
    }

    if (args.serviceAction === "unload") {
      const paths = getLaunchdPaths();
      await runLaunchctl(buildLaunchctlArgs("unload", paths));
      console.log(JSON.stringify({
        ok: true,
        serviceKind: "launchd_service",
        action: "unload",
        plistTarget: "default LaunchAgent"
      }, null, 2));
      return;
    }

    if (args.serviceAction === "uninstall") {
      const paths = getLaunchdPaths();
      try {
        await runLaunchctl(buildLaunchctlArgs("unload", paths));
      } catch {
        // The service may already be unloaded; uninstall should still remove our plist.
      }
      removeLaunchdPlist();
      console.log(JSON.stringify(buildServiceUninstallPayload(paths), null, 2));
      return;
    }
  }

  throw new Error(`Unknown command: ${args.command}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
