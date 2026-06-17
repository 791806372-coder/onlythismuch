import { spawn } from "node:child_process";
import type { Snapshot } from "../../src/contract/schema";

type AvailableUsage = Extract<
  Snapshot["providers"][number]["usage"],
  { available: true }
>;

export type CodexAppServerUsageOverlay = {
  codex?: {
    usage: AvailableUsage;
    capturedAt: string;
    version?: string;
  };
};

const CODEX_APP_SERVER_TIMEOUT_MS = 20_000;
const CODEX_APP_SERVER_MAX_OUTPUT_BYTES = 16_384;

export async function collectCodexAppServerUsage(
  command = "codex"
): Promise<CodexAppServerUsageOverlay> {
  const rateLimits = await readCodexRateLimits(command);
  if (!rateLimits) {
    return {};
  }

  return parseCodexAppServerRateLimits(rateLimits, new Date().toISOString());
}

export function parseCodexAppServerRateLimits(
  value: unknown,
  capturedAt = new Date().toISOString()
): CodexAppServerUsageOverlay {
  if (!isOffsetIsoDate(capturedAt)) {
    return {};
  }

  const quota = getObject(value);
  if (!quota) {
    return {};
  }

  const primary = readUsageWindow(quota, "primary", 300);
  const secondary = readUsageWindow(quota, "secondary", 10_080);
  if (!primary || !secondary) {
    return {};
  }

  return {
    codex: {
      capturedAt,
      usage: {
        available: true,
        source: "codex_app_server",
        fiveHourRemainingPercent: primary.remainingPercent,
        fiveHourResetAt: primary.resetsAt,
        weeklyRemainingPercent: secondary.remainingPercent,
        weeklyResetAt: secondary.resetsAt,
      },
    },
  };
}

function readCodexRateLimits(command: string): Promise<unknown | undefined> {
  return new Promise((resolve) => {
    const child = spawn(command, ["app-server"], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let outputBytes = 0;
    let requestId = 0;
    let settled = false;
    const pending = new Map<number, (message: JsonRpcMessage) => void>();

    const settle = (value: unknown | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      resolve(value);
    };

    const rpc = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<unknown>((rpcResolve, rpcReject) => {
        const id = ++requestId;
        pending.set(id, (message) => {
          if (message.error) {
            rpcReject(new Error("codex_app_server_rpc_error"));
            return;
          }
          rpcResolve(message.result);
        });

        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });

    const timer = setTimeout(() => settle(undefined), CODEX_APP_SERVER_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > CODEX_APP_SERVER_MAX_OUTPUT_BYTES) {
        settle(undefined);
        return;
      }

      stdout += chunk.toString("utf8");
      let newlineIndex: number;
      while ((newlineIndex = stdout.indexOf("\n")) !== -1) {
        const line = stdout.slice(0, newlineIndex).trim();
        stdout = stdout.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }

        const message = parseJsonRpcLine(line);
        if (!message || typeof message.id !== "number") {
          continue;
        }

        const callback = pending.get(message.id);
        if (!callback) {
          continue;
        }
        pending.delete(message.id);
        callback(message);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > CODEX_APP_SERVER_MAX_OUTPUT_BYTES) {
        settle(undefined);
      }
    });

    child.on("error", () => settle(undefined));
    child.on("close", () => settle(undefined));

    (async () => {
      try {
        await rpc("initialize", {
          clientInfo: {
            name: "ai-usage-widget",
            version: "0.1.0",
          },
        });
        const result = await rpc("account/rateLimits/read");
        const rateLimits = getObject(result)?.rateLimits;
        settle(rateLimits);
      } catch {
        settle(undefined);
      }
    })();
  });
}

type JsonRpcMessage = {
  id?: unknown;
  result?: unknown;
  error?: unknown;
};

function parseJsonRpcLine(line: string): JsonRpcMessage | undefined {
  try {
    const parsed = JSON.parse(line) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonRpcMessage
      : undefined;
  } catch {
    return undefined;
  }
}

function readUsageWindow(
  quota: Record<string, unknown>,
  key: "primary" | "secondary",
  expectedWindowDurationMins: number
): { remainingPercent: number; resetsAt: string } | undefined {
  const window = getObject(quota[key]);
  if (!window) {
    return undefined;
  }

  const usedPercent = getInteger(window.usedPercent);
  const windowDurationMins = getInteger(window.windowDurationMins);
  const resetsAt = getInteger(window.resetsAt);
  if (
    usedPercent === undefined ||
    usedPercent < 0 ||
    usedPercent > 100 ||
    windowDurationMins !== expectedWindowDurationMins ||
    resetsAt === undefined ||
    resetsAt <= 0
  ) {
    return undefined;
  }

  const resetDate = new Date(resetsAt * 1000).toISOString();
  if (!isOffsetIsoDate(resetDate)) {
    return undefined;
  }

  return {
    remainingPercent: 100 - usedPercent,
    resetsAt: resetDate,
  };
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function getInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function isOffsetIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}
