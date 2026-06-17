import type { Snapshot } from "../../src/contract/schema";
import type { CommandRunner } from "./collectors";

type ProviderId = "claude" | "codex";
type AvailableUsage = Extract<
  Snapshot["providers"][number]["usage"],
  { available: true }
>;

export type CodexBarUsageOverlay = Partial<Record<ProviderId, {
  usage: AvailableUsage;
  capturedAt: string;
  version?: string;
}>>;

const CODEXBAR_TIMEOUT_MS = 8_000;
const CODEXBAR_MAX_OUTPUT_BYTES = 16_384;
const CODEXBAR_PROVIDER_ALIASES: Record<string, ProviderId> = {
  claude: "claude",
  codex: "codex",
};

export async function collectCodexBarUsage(
  runner: CommandRunner
): Promise<CodexBarUsageOverlay> {
  const [versionResult, usageResult] = await Promise.all([
    runner("codexbar", ["--version"], {
      timeoutMs: CODEXBAR_TIMEOUT_MS,
      maxOutputBytes: 1_024,
    }),
    runner("codexbar", ["usage", "--provider", "both", "--format", "json", "--json-only"], {
      timeoutMs: CODEXBAR_TIMEOUT_MS,
      maxOutputBytes: CODEXBAR_MAX_OUTPUT_BYTES,
    }),
  ]);

  if (usageResult.status !== "ok") {
    return {};
  }

  const sourceVersion = versionResult.status === "ok"
    ? extractVersion(versionResult.stdout)
    : undefined;
  return parseCodexBarUsageOutput(usageResult.stdout, sourceVersion, new Date().toISOString());
}

export function parseCodexBarUsageOutput(
  stdout: string,
  sourceVersion?: string,
  capturedAt = new Date().toISOString()
): CodexBarUsageOverlay {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout) as unknown;
  } catch {
    return {};
  }

  if (!isOffsetIsoDate(capturedAt)) {
    return {};
  }

  const payloads = Array.isArray(parsed) ? parsed : [parsed];
  const overlay: CodexBarUsageOverlay = {};

  for (const payload of payloads) {
    const providerId = providerIdFromPayload(payload);
    if (!providerId) {
      continue;
    }

    const usage = usageFromPayload(payload, sourceVersion, capturedAt);
    if (!usage) {
      continue;
    }

    overlay[providerId] = usage;
  }

  return overlay;
}

function providerIdFromPayload(payload: unknown): ProviderId | undefined {
  const provider = normalizedProviderName(getString(payload, ["provider"]));
  if (!provider) {
    return undefined;
  }

  return CODEXBAR_PROVIDER_ALIASES[provider];
}

function usageFromPayload(
  payload: unknown,
  sourceVersion: string | undefined,
  capturedAt: string
): CodexBarUsageOverlay[ProviderId] | undefined {
  const usage = getObject(payload, ["usage"]);
  if (!usage) {
    return undefined;
  }

  const primary = readUsageWindow(usage, "primary");
  const secondary = readUsageWindow(usage, "secondary");
  if (!primary || !secondary) {
    return undefined;
  }
  const providerVersion = extractVersion(getString(payload, ["version"]) ?? "");
  const version = safeSourceVersion(sourceVersion);

  return {
    capturedAt,
    ...(providerVersion ? { version: providerVersion } : {}),
    usage: {
      available: true,
      source: "codexbar",
      ...(version ? { sourceVersion: version } : {}),
      fiveHourRemainingPercent: primary.remainingPercent,
      fiveHourResetAt: primary.resetsAt,
      weeklyRemainingPercent: secondary.remainingPercent,
      weeklyResetAt: secondary.resetsAt,
    },
  };
}

function readUsageWindow(
  usage: Record<string, unknown>,
  key: "primary" | "secondary"
): { remainingPercent: number; resetsAt: string } | undefined {
  const window = getObject(usage, [key]);
  if (!window) {
    return undefined;
  }

  const usedPercent = getNumber(window, ["usedPercent"]);
  const resetsAt = getString(window, ["resetsAt"]);
  if (
    usedPercent === undefined ||
    !Number.isInteger(usedPercent) ||
    usedPercent < 0 ||
    usedPercent > 100 ||
    !resetsAt ||
    !isOffsetIsoDate(resetsAt)
  ) {
    return undefined;
  }

  return {
    remainingPercent: 100 - usedPercent,
    resetsAt,
  };
}

function getObject(value: unknown, path: string[]): Record<string, unknown> | undefined {
  const nested = getValue(value, path);
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : undefined;
}

function getString(value: unknown, path: string[]): string | undefined {
  const nested = getValue(value, path);
  return typeof nested === "string" ? nested : undefined;
}

function getNumber(value: unknown, path: string[]): number | undefined {
  const nested = getValue(value, path);
  return typeof nested === "number" && Number.isFinite(nested) ? nested : undefined;
}

function getValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function isOffsetIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function extractVersion(output: string): string | undefined {
  const match = output.match(/\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?/);
  return match?.[0]?.slice(0, 40);
}

function safeSourceVersion(version: string | undefined): string | undefined {
  return version ? extractVersion(version) : undefined;
}

function normalizedProviderName(value: string | undefined): string | undefined {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return normalized || undefined;
}
