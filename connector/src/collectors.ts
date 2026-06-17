import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseSnapshot, type Snapshot } from "../../src/contract/schema";
import {
  collectCodexAppServerUsage,
  type CodexAppServerUsageOverlay,
} from "./codexAppServer";
import { collectCodexBarUsage, type CodexBarUsageOverlay } from "./codexbar";
import {
  collectClaudeCodeTtyUsage,
  type ClaudeCodeTtyUsageOverlay,
} from "./claudeCodeTty";
import type { ConnectorConfig } from "./config";

type ProviderId = "claude" | "codex";
type Health = Snapshot["providers"][number]["health"];
type UsageReason = Extract<
  Snapshot["providers"][number]["usage"],
  { available: false }
>["reason"];

export type CommandResultStatus =
  | "ok"
  | "failed"
  | "not_found"
  | "timeout"
  | "output_capped";

export type CommandResult = {
  status: CommandResultStatus;
  stdout: string;
  stderr: string;
  exitCode?: number;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options: { timeoutMs: number; maxOutputBytes: number }
) => Promise<CommandResult>;

export type ProviderSpec = {
  id: ProviderId;
  displayName: string;
  command: string;
  commandCandidates?: string[];
  appBundleCandidates?: string[];
  appBundleExecutableRelativePaths?: string[];
  versionStoreCandidates?: string[];
  versionArgs: string[];
  authArgs: string[];
  statusProbeArgs?: string[];
};

export type CollectorOptions = {
  codexBar?: boolean;
  codexAppServer?: boolean;
  codexAppServerCollector?: () => Promise<CodexAppServerUsageOverlay>;
  claudeCodeTty?: boolean;
  claudeCodeTtyCollector?: () => Promise<ClaudeCodeTtyUsageOverlay>;
};

const COMMAND_TIMEOUT_MS = 5_000;
const MAX_OUTPUT_BYTES = 4_096;
const CONNECTOR_VERSION = "0.1.0";
const COLLECTOR_PATH_SEGMENTS = [
  "~/.local/bin",
  "~/.hermes/node/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
];

const PROVIDERS: ProviderSpec[] = [
  {
    id: "claude",
    displayName: "Claude",
    command: "claude",
    commandCandidates: [
      "claude",
      "~/.local/bin/claude",
      "~/.local/share/claude/versions/latest",
      "/opt/homebrew/bin/claude",
      "/usr/local/bin/claude",
    ],
    versionStoreCandidates: [
      "~/.local/share/claude/versions",
    ],
    appBundleCandidates: [
      "/Applications/Claude.app",
      "~/Applications/Claude.app",
    ],
    versionArgs: ["--version"],
    authArgs: ["auth", "status"],
  },
  {
    id: "codex",
    displayName: "Codex",
    command: "codex",
    commandCandidates: [
      "codex",
      "~/.local/bin/codex",
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
    ],
    appBundleCandidates: [
      "/Applications/Codex.app",
      "~/Applications/Codex.app",
    ],
    appBundleExecutableRelativePaths: [
      "Contents/Resources/codex",
    ],
    versionArgs: ["--version"],
    authArgs: ["login", "status"],
    statusProbeArgs: ["doctor", "--json", "--summary"],
  },
];

export async function collectCurrentSnapshot(
  config: ConnectorConfig,
  runner: CommandRunner = runLimitedCommand,
  options: CollectorOptions = {}
): Promise<Snapshot> {
  const now = new Date().toISOString();
  const claudeCodeTtyUsage = options.claudeCodeTty
    ? await (options.claudeCodeTtyCollector ?? collectClaudeCodeTtyUsage)()
    : {};
  const providerSpecs = options.claudeCodeTty
    ? PROVIDERS.filter((provider) => provider.id !== "claude")
    : PROVIDERS;
  const providerResults = Promise.all(
    providerSpecs.map((provider) => collectProvider(provider, runner))
  );
  const codexBarResults = options.codexBar
    ? collectCodexBarUsage(runner)
    : Promise.resolve({} as CodexBarUsageOverlay);
  const codexAppServerResults = options.codexAppServer
    ? (options.codexAppServerCollector ?? collectCodexAppServerUsage)()
    : Promise.resolve({} as CodexAppServerUsageOverlay);
  const [collectedProviders, codexBarUsage, codexAppServerUsage] = await Promise.all([
    providerResults,
    codexBarResults,
    codexAppServerResults,
  ]);
  const providers = options.claudeCodeTty
    ? [
        await collectClaudeTtyProvider(PROVIDERS[0], runner, claudeCodeTtyUsage.claude),
        ...collectedProviders,
      ]
    : collectedProviders;
  return parseSnapshot({
    schemaVersion: 1,
    device: {
      id: config.deviceId,
      name: config.name,
      platform: platformName(),
      connectorVersion: CONNECTOR_VERSION,
      online: true,
      updatedAt: now,
    },
    providers: providers.map((provider) => {
      const overlay =
        (provider.id === "codex" ? codexAppServerUsage.codex : undefined) ??
        (provider.id === "claude" ? claudeCodeTtyUsage.claude : undefined) ??
        codexBarUsage[provider.id as ProviderId];
      if (!overlay || !canApplyUsageOverlay(provider)) {
        return provider;
      }

      return {
        ...provider,
        version: provider.version ?? overlay.version,
        capturedAt: overlay.capturedAt,
        usage: overlay.usage,
      };
    }),
  });
}

async function collectClaudeTtyProvider(
  spec: ProviderSpec,
  runner: CommandRunner,
  overlay: ClaudeCodeTtyUsageOverlay["claude"]
): Promise<Snapshot["providers"][number]> {
  if (overlay) {
    return {
      id: spec.id,
      displayName: spec.displayName,
      connected: true,
      health: "working",
      version: overlay.version,
      capturedAt: overlay.capturedAt,
      usage: overlay.usage,
    };
  }

  const versionResult = await runProviderCommand(spec, spec.versionArgs, runner);
  const hardFailure = firstHardFailure(versionResult);
  const unexpectedFailure = versionResult.status === "failed";
  const commandMissing = versionResult.status === "not_found";
  const connected = !commandMissing && !hardFailure && !unexpectedFailure;
  const health = inferHealth(commandMissing, hardFailure, unexpectedFailure, connected);
  const version = extractVersion(versionResult.stdout) ?? readProviderAppBundleVersion(spec);
  const error = hardFailure
    ? {
        code: hardFailure,
        message: errorMessage(hardFailure),
      }
    : unexpectedFailure
      ? {
          code: "command_failed",
          message: "Collector command failed",
        }
      : commandMissing
        ? {
            code: "command_not_found",
            message: `${spec.displayName} CLI was not found`,
          }
        : undefined;

  return {
    id: spec.id,
    displayName: spec.displayName,
    connected,
    health,
    version,
    usage: unavailableUsage(connected ? "no_stable_source" : "collector_error"),
    ...(error ? { error } : {}),
  };
}

function canApplyUsageOverlay(provider: Snapshot["providers"][number]): boolean {
  const probeOnlyDegraded =
    provider.id === "codex" &&
    provider.health === "degraded" &&
    provider.error?.code === "status_probe_unavailable";

  return provider.connected &&
    ((provider.health === "working" && !provider.error) || probeOnlyDegraded) &&
    !provider.usage.available &&
    provider.usage.reason === "no_stable_source";
}

export async function collectProvider(
  spec: ProviderSpec,
  runner: CommandRunner
): Promise<Snapshot["providers"][number]> {
  const [versionResult, authResult, statusProbeResult] = await Promise.all([
    runProviderCommand(spec, spec.versionArgs, runner),
    runProviderCommand(spec, spec.authArgs, runner),
    spec.statusProbeArgs
      ? runProviderCommand(spec, spec.statusProbeArgs, runner)
      : Promise.resolve(undefined),
  ]);

  const hardFailure = firstHardFailure(versionResult, authResult);
  const authLoggedOut = indicatesLoggedOut(authResult);
  const unexpectedFailure =
    versionResult.status === "failed" ||
    (authResult.status === "failed" && !authLoggedOut);
  const commandMissing =
    versionResult.status === "not_found" || authResult.status === "not_found";
  const connected = commandMissing || hardFailure || unexpectedFailure
    ? false
    : inferConnected(authResult);
  const statusProbeIssue =
    !commandMissing && !hardFailure && !unexpectedFailure && connected
      ? inferStatusProbeIssue(statusProbeResult)
      : undefined;
  const health = statusProbeIssue
    ? "degraded"
    : inferHealth(commandMissing, hardFailure, unexpectedFailure, connected);
  const version = extractVersion(versionResult.stdout) ?? readProviderAppBundleVersion(spec);
  const reason = inferUsageReason(
    spec,
    authResult,
    commandMissing,
    hardFailure,
    unexpectedFailure,
    connected
  );
  const error = hardFailure
    ? {
        code: hardFailure,
        message: errorMessage(hardFailure),
      }
    : unexpectedFailure
      ? {
          code: "command_failed",
          message: "Collector command failed",
        }
    : commandMissing
      ? {
          code: "command_not_found",
          message: `${spec.displayName} CLI was not found`,
        }
      : statusProbeIssue
      ? {
          code: statusProbeIssue.code,
          message: statusProbeIssue.message,
        }
      : undefined;

  return {
    id: spec.id,
    displayName: spec.displayName,
    connected,
    health,
    version,
    usage: unavailableUsage(reason),
    ...(error ? { error } : {}),
  };
}

export function readProviderAppBundleVersion(spec: Pick<ProviderSpec, "appBundleCandidates">): string | undefined {
  for (const candidate of spec.appBundleCandidates ?? []) {
    const version = readAppBundleVersion(candidate);
    if (version) {
      return version;
    }
  }

  return undefined;
}

export function readAppBundleVersion(appPath: string): string | undefined {
  const infoPath = path.join(expandHome(appPath), "Contents", "Info.plist");
  if (!fs.existsSync(infoPath)) {
    return undefined;
  }

  return runPlutilExtract(infoPath);
}

function runPlutilExtract(infoPath: string): string | undefined {
  const result = spawnSync(
    "/usr/bin/plutil",
    ["-extract", "CFBundleShortVersionString", "raw", "-o", "-", infoPath],
    {
      encoding: "utf8",
      maxBuffer: 1024,
      timeout: 1_000,
    }
  );
  if (result.status !== 0) {
    return undefined;
  }

  return sanitizeVersion(result.stdout);
}

async function runProviderCommand(
  spec: ProviderSpec,
  args: string[],
  runner: CommandRunner
): Promise<CommandResult> {
  const candidates = providerCommandCandidates(spec);
  let lastResult: CommandResult | undefined;

  for (const candidate of candidates) {
    const result = await runner(expandHome(candidate), args, {
      timeoutMs: COMMAND_TIMEOUT_MS,
      maxOutputBytes: MAX_OUTPUT_BYTES,
    });
    if (result.status !== "not_found") {
      return result;
    }
    lastResult = result;
  }

  return lastResult ?? { status: "not_found", stdout: "", stderr: "" };
}

export function providerCommandCandidates(spec: ProviderSpec): string[] {
  return [
    ...new Set([
      ...(spec.commandCandidates ?? [spec.command]),
      ...discoverVersionStoreExecutables(spec.versionStoreCandidates),
      ...discoverAppBundleExecutables(spec),
    ]),
  ];
}

export function discoverVersionStoreExecutables(storeCandidates: string[] = []): string[] {
  const executables: string[] = [];
  for (const storeCandidate of storeCandidates) {
    const storePath = expandHome(storeCandidate);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(storePath, { withFileTypes: true });
    } catch {
      continue;
    }

    const candidates = entries
      .filter((entry) => entry.isFile() || entry.isSymbolicLink())
      .map((entry) => path.join(storePath, entry.name))
      .filter(isExecutableFile)
      .sort(compareVersionedPathsDesc);
    executables.push(...candidates);
  }

  return executables;
}

export function discoverAppBundleExecutables(
  spec: Pick<ProviderSpec, "appBundleCandidates" | "appBundleExecutableRelativePaths">
): string[] {
  const executables: string[] = [];
  for (const appCandidate of spec.appBundleCandidates ?? []) {
    const appPath = expandHome(appCandidate);
    for (const relativePath of spec.appBundleExecutableRelativePaths ?? []) {
      const candidate = path.join(appPath, relativePath);
      if (isExecutableFile(candidate)) {
        executables.push(candidate);
      }
    }
  }

  return executables;
}

export function runLimitedCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number; maxOutputBytes: number }
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PATH: buildCollectorPath(process.env.PATH),
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let settled = false;

    const settle = (result: CommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const appendOutput = (chunk: Buffer, stream: "stdout" | "stderr") => {
      outputBytes += chunk.byteLength;
      if (outputBytes > options.maxOutputBytes) {
        child.kill("SIGTERM");
        settle({ status: "output_capped", stdout, stderr });
        return;
      }

      if (stream === "stdout") {
        stdout += chunk.toString("utf8");
      } else {
        stderr += chunk.toString("utf8");
      }
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle({ status: "timeout", stdout, stderr });
    }, options.timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => appendOutput(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => appendOutput(chunk, "stderr"));

    child.on("error", (error: NodeJS.ErrnoException) => {
      settle({
        status: error.code === "ENOENT" ? "not_found" : "failed",
        stdout,
        stderr,
      });
    });

    child.on("close", (code) => {
      settle({
        status: code === 0 ? "ok" : "failed",
        stdout,
        stderr,
        exitCode: code ?? undefined,
      });
    });
  });
}

export function buildCollectorPath(
  existingPath = "",
  homeDir = os.homedir()
): string {
  const preferred = COLLECTOR_PATH_SEGMENTS.map((segment) =>
    segment.startsWith("~/") ? `${homeDir}${segment.slice(1)}` : segment
  );
  const existing = existingPath.split(path.delimiter).filter(Boolean);

  return [...new Set([...preferred, ...existing])].join(path.delimiter);
}

function unavailableUsage(reason: UsageReason): Snapshot["providers"][number]["usage"] {
  return {
    available: false,
    reason,
  };
}

function inferConnected(result: CommandResult): boolean {
  if (indicatesLoggedOut(result)) {
    return false;
  }

  const output = commandOutput(result);
  if (
    /logged\s+in/.test(output) ||
    /authenticated/.test(output) ||
    /signed\s+in/.test(output)
  ) {
    return true;
  }

  return result.status === "ok";
}

function inferHealth(
  commandMissing: boolean,
  hardFailure: CommandResultStatus | undefined,
  unexpectedFailure: boolean,
  connected: boolean
): Health {
  if (hardFailure || commandMissing || unexpectedFailure) {
    return "error";
  }
  return connected ? "working" : "degraded";
}

function inferUsageReason(
  spec: ProviderSpec,
  authResult: CommandResult,
  commandMissing: boolean,
  hardFailure: CommandResultStatus | undefined,
  unexpectedFailure: boolean,
  connected: boolean
): UsageReason {
  if (hardFailure || commandMissing || unexpectedFailure) {
    return "collector_error";
  }
  if (!connected) {
    return "not_logged_in";
  }
  if (indicatesThirdPartyNoQuota(spec, authResult)) {
    return "third_party_no_quota";
  }
  return "no_stable_source";
}

function indicatesLoggedOut(result: CommandResult): boolean {
  const output = commandOutput(result);
  return (
    /not\s+(logged|authenticated|signed)/.test(output) ||
    /logged\s*out/.test(output) ||
    /unauthenticated/.test(output) ||
    /login\s+required/.test(output)
  );
}

function commandOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.toLowerCase();
}

function indicatesThirdPartyNoQuota(spec: ProviderSpec, result: CommandResult): boolean {
  if (spec.id !== "claude" || result.status !== "ok") {
    return false;
  }

  const output = commandOutput(result);
  if (
    /\bcc[-_\s]?switch\b/.test(output) ||
    /\bopenrouter\b/.test(output) ||
    /\bopenai[-_\s]?compatible\b/.test(output) ||
    /\b(custom|override)\s+(api\s+)?(base|provider|route)\b/.test(output) ||
    /\b(vertex\s+ai|amazon\s+bedrock)\b/.test(output)
  ) {
    return true;
  }

  if (indicatesNonFirstPartyBaseUrl(output)) {
    return true;
  }

  const providerMatches = output.matchAll(/\b(?:api\s*)?provider\s*[:=]\s*([a-z0-9_.-]+)/g);
  for (const match of providerMatches) {
    if (!isFirstPartyClaudeProvider(match[1])) {
      return true;
    }
  }

  return false;
}

function inferStatusProbeIssue(
  result: CommandResult | undefined
): { code: string; message: string } | undefined {
  if (!result || result.status === "not_found") {
    return undefined;
  }
  if (result.status === "timeout" || result.status === "output_capped") {
    return {
      code: "status_probe_unavailable",
      message: "Status probe did not finish",
    };
  }

  const report = parseStatusProbeReport(result.stdout);
  if (!report) {
    return undefined;
  }
  if (["ok", "pass", "passed", "healthy"].includes(report.overallStatus)) {
    return undefined;
  }
  if (["warn", "warning", "degraded"].includes(report.overallStatus)) {
    return {
      code: "status_probe_warning",
      message: "Status probe reported warnings",
    };
  }
  if (["fail", "failed", "error", "unhealthy"].includes(report.overallStatus)) {
    return {
      code: "status_probe_failed",
      message: "Status probe reported issues",
    };
  }

  return undefined;
}

function parseStatusProbeReport(output: string): { overallStatus: string } | undefined {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(output.slice(start, end + 1)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const overallStatus = (parsed as { overallStatus?: unknown }).overallStatus;
    if (typeof overallStatus !== "string") {
      return undefined;
    }

    return { overallStatus: overallStatus.toLowerCase() };
  } catch {
    return undefined;
  }
}

function isFirstPartyClaudeProvider(provider: string | undefined): boolean {
  if (!provider) {
    return false;
  }

  return ["anthropic", "claude", "claudeai", "official", "first-party"].includes(provider);
}

function indicatesNonFirstPartyBaseUrl(output: string): boolean {
  const baseUrlMatches = output.matchAll(
    /\b(?:anthropic_base_url|api\s+base(?:\s+url)?|base\s+url)\b\s*[:=]\s*["']?([^\s"',)]+)/g
  );

  for (const match of baseUrlMatches) {
    const baseUrl = match[1]?.trim();
    if (baseUrl && /^https?:\/\//.test(baseUrl) && !isFirstPartyClaudeBaseUrl(baseUrl)) {
      return true;
    }
  }

  return false;
}

function isFirstPartyClaudeBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "anthropic.com" ||
      host.endsWith(".anthropic.com") ||
      host === "claude.ai" ||
      host.endsWith(".claude.ai");
  } catch {
    return false;
  }
}

function firstHardFailure(
  ...results: CommandResult[]
): CommandResultStatus | undefined {
  return results.find((result) =>
    result.status === "timeout" || result.status === "output_capped"
  )?.status;
}

function extractVersion(output: string): string | undefined {
  const match = output.match(/\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?/);
  return match?.[0]?.slice(0, 40);
}

function sanitizeVersion(output: string): string | undefined {
  const version = output.trim();
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/.test(version)) {
    return undefined;
  }
  return version;
}

function isExecutableFile(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    fs.accessSync(candidate, fs.constants.X_OK);
    return stat.isFile();
  } catch {
    return false;
  }
}

function compareVersionedPathsDesc(left: string, right: string): number {
  return compareVersionStringsDesc(path.basename(left), path.basename(right));
}

function compareVersionStringsDesc(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : -1;
    const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : -1;
    if (leftPart !== rightPart) {
      return rightPart - leftPart;
    }
  }

  return right.localeCompare(left);
}

function expandHome(command: string): string {
  if (command === "~") {
    return os.homedir();
  }
  if (command.startsWith("~/")) {
    return `${os.homedir()}${command.slice(1)}`;
  }
  return command;
}

function errorMessage(status: CommandResultStatus): string {
  switch (status) {
    case "timeout":
      return "Collector command timed out";
    case "output_capped":
      return "Collector output was capped";
    default:
      return "Collector command failed";
  }
}

function platformName(): Snapshot["device"]["platform"] {
  if (os.platform() === "darwin") {
    return "macOS";
  }
  if (os.platform() === "win32") {
    return "Windows";
  }
  return "Linux";
}
