import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Snapshot } from "../../src/contract/schema";

type AvailableUsage = Extract<
  Snapshot["providers"][number]["usage"],
  { available: true }
>;

export type ClaudeCodeTtyUsageOverlay = {
  claude?: {
    usage: AvailableUsage;
    capturedAt: string;
    version?: string;
  };
};

const SCREEN_PATH = "/usr/bin/screen";
const CLAUDE_CODE_TTY_SOURCE = "claude_code_tty";
const COMMAND_READY_WAIT_MS = 7_000;
const HARDCOPY_WAIT_MS = 20_000;
const HARDCOPY_RETRY_WAIT_MS = 4_000;
const HARDCOPY_ATTEMPTS = 4;
const CLEANUP_WAIT_MS = 1_000;
const TRUST_CONFIRM_WAIT_MS = 1_500;
const SCREEN_COLUMNS = "160";
const SCREEN_LINES = "80";
const PERCENT_USED_RE = /\b(\d{1,3})[\s\p{Separator}\u200B\u200C\u200D]*[%％﹪][\s\p{Separator}\u200B\u200C\u200D]*used\b/iu;

export async function collectClaudeCodeTtyUsage(
  command = "claude",
  options: {
    homeDir?: string;
    workspaceDir?: string;
    now?: Date;
  } = {}
): Promise<ClaudeCodeTtyUsageOverlay> {
  if (!fs.existsSync(SCREEN_PATH)) {
    return {};
  }

  const now = options.now ?? new Date();
  const cwd = options.workspaceDir ?? process.env.AIUW_CLAUDE_USAGE_WORKSPACE ?? os.homedir();
  const hardcopyPath = path.join(os.tmpdir(), `aiuw-claude-usage-${process.pid}-${Date.now()}.txt`);
  const sessionName = `aiuw-claude-usage-${process.pid}-${Date.now()}`;

  try {
    fs.accessSync(cwd, fs.constants.R_OK | fs.constants.X_OK);
  } catch {
    return {};
  }

  const screenEnv = {
    ...process.env,
    HOME: options.homeDir ?? os.homedir(),
    LOGNAME: process.env.LOGNAME || os.userInfo().username,
    PWD: cwd,
    SHELL: process.env.SHELL || "/bin/zsh",
    TERM: process.env.TERM || "xterm-256color",
    USER: process.env.USER || os.userInfo().username,
  };
  const runScreen = (args: string[]) => spawnSync(SCREEN_PATH, args, {
    cwd,
    encoding: "utf8",
    env: screenEnv,
    timeout: 5_000,
    maxBuffer: 4_096,
  });

  cleanupStaleClaudeCodeScreens(screenEnv);
  const started = runScreen(["-dmS", sessionName, command]);
  if (started.status !== 0) {
    debugClaudeTty("start_failed", { status: started.status ?? null });
    return {};
  }

  try {
    await sleep(1_500);
    runScreen(["-S", sessionName, "-p", "0", "-X", "height", "-w", SCREEN_LINES, SCREEN_COLUMNS]);
    runScreen(["-S", sessionName, "-p", "0", "-X", "width", "-w", SCREEN_COLUMNS, SCREEN_LINES]);
    await sleep(500);
    runScreen(["-S", sessionName, "-p", "0", "-X", "stuff", "\r"]);
    await sleep(TRUST_CONFIRM_WAIT_MS);
    runScreen(["-S", sessionName, "-p", "0", "-X", "stuff", "\r"]);
    await sleep(COMMAND_READY_WAIT_MS);
    runScreen(["-S", sessionName, "-p", "0", "-X", "stuff", "\u0015/usage\r"]);
    await sleep(HARDCOPY_WAIT_MS);
    for (let attempt = 1; attempt <= HARDCOPY_ATTEMPTS; attempt += 1) {
      try {
        fs.unlinkSync(hardcopyPath);
      } catch {
        // The hardcopy may not exist before the first attempt.
      }
      runScreen(["-S", sessionName, "-p", "0", "-X", "hardcopy", "-h", hardcopyPath]);
      const raw = fs.existsSync(hardcopyPath)
        ? fs.readFileSync(hardcopyPath, "utf8")
        : "";
      const overlay = parseClaudeCodeUsageScreen(raw, now);
      const signals = usageScreenSignals(raw);
      debugClaudeTty("hardcopy", {
        attempt,
        bytes: Buffer.byteLength(raw),
        ...signals,
        parsed: Boolean(overlay.claude),
      });
      if (overlay.claude || attempt === HARDCOPY_ATTEMPTS) {
        return overlay;
      }
      await sleep(HARDCOPY_RETRY_WAIT_MS);
    }
    return {};
  } catch {
    debugClaudeTty("exception", {});
    return {};
  } finally {
    runScreen(["-S", sessionName, "-X", "quit"]);
    cleanupStaleClaudeCodeScreens(screenEnv);
    try {
      fs.unlinkSync(hardcopyPath);
    } catch {
      // The hardcopy may not exist if Claude Code failed before rendering usage.
    }
    await sleep(CLEANUP_WAIT_MS);
  }
}

function cleanupStaleClaudeCodeScreens(env: NodeJS.ProcessEnv): void {
  const listed = spawnSync(SCREEN_PATH, ["-ls"], {
    encoding: "utf8",
    env,
    timeout: 5_000,
    maxBuffer: 16_384,
  });
  const output = `${listed.stdout ?? ""}\n${listed.stderr ?? ""}`;
  for (const match of output.matchAll(/\b(\d+\.aiuw-claude-usage-[^\s]+)/g)) {
    for (const target of [match[1], match[1].replace(/^\d+\./, "")]) {
      spawnSync(SCREEN_PATH, ["-S", target, "-X", "quit"], {
        encoding: "utf8",
        env,
        timeout: 5_000,
        maxBuffer: 1_024,
      });
    }
  }
  spawnSync(SCREEN_PATH, ["-wipe"], {
    encoding: "utf8",
    env,
    timeout: 5_000,
    maxBuffer: 1_024,
  });
}

export function parseClaudeCodeUsageScreen(
  raw: string,
  referenceDate = new Date()
): ClaudeCodeTtyUsageOverlay {
  const text = normalizeUsageScreen(raw);
  if (!text.includes("Current session") || !text.includes("Current week")) {
    return {};
  }
  if (!hasOfficialClaudeUsageMarker(text)) {
    return {};
  }

  const session = parseUsageWindow(text, "Current session", "Current week", referenceDate);
  const week = parseUsageWindow(text, "Current week", "What's contributing", referenceDate);
  if (!session || !week) {
    return {};
  }

  const capturedAt = referenceDate.toISOString();
  if (!isOffsetIsoDate(capturedAt)) {
    return {};
  }

  const version = safeVersion(text.match(/Claude\s+Code\s+v?(\d+(?:\.\d+){1,3})/i)?.[1]);

  return {
    claude: {
      capturedAt,
      ...(version ? { version } : {}),
      usage: {
        available: true,
        source: CLAUDE_CODE_TTY_SOURCE,
        ...(version ? { sourceVersion: version } : {}),
        fiveHourRemainingPercent: 100 - session.usedPercent,
        fiveHourResetAt: session.resetAt,
        weeklyRemainingPercent: 100 - week.usedPercent,
        weeklyResetAt: week.resetAt,
      },
    },
  };
}

function hasOfficialClaudeUsageMarker(text: string): boolean {
  return /\bClaude\s+(?:Pro|Max|Team|Enterprise)\b/i.test(text) ||
    /\bUsage credits\b/i.test(text);
}

function usageScreenSignals(raw: string): Record<string, boolean> {
  const text = normalizeUsageScreen(raw);
  const session = usageWindowSignals(text, "Current session", "Current week");
  const week = usageWindowSignals(text, "Current week", "What's contributing");
  return {
    hasCurrentSession: text.includes("Current session"),
    hasCurrentWeek: text.includes("Current week"),
    hasUsageCredits: /\bUsage credits\b/i.test(text),
    hasOfficialMarker: hasOfficialClaudeUsageMarker(text),
    hasSessionPercent: session.hasPercent,
    hasSessionReset: session.hasReset,
    hasWeekPercent: week.hasPercent,
    hasWeekReset: week.hasReset,
  };
}

function usageWindowSignals(
  text: string,
  label: string,
  nextLabel: string
): { hasPercent: boolean; hasReset: boolean } {
  const start = text.indexOf(label);
  if (start < 0) {
    return { hasPercent: false, hasReset: false };
  }
  const next = text.indexOf(nextLabel, start + label.length);
  const section = next > start ? text.slice(start, next) : text.slice(start);
  return {
    hasPercent: PERCENT_USED_RE.test(section),
    hasReset: /\bResets\s+.+?\([^)]+\)/i.test(section),
  };
}

function parseUsageWindow(
  text: string,
  label: string,
  nextLabel: string,
  referenceDate: Date
): { usedPercent: number; resetAt: string } | undefined {
  const start = text.indexOf(label);
  if (start < 0) {
    return undefined;
  }
  const next = text.indexOf(nextLabel, start + label.length);
  const section = next > start ? text.slice(start, next) : text.slice(start);
  const percentMatch = section.match(PERCENT_USED_RE);
  const resetMatch = section.match(/\bResets\s+(.+?\([^)]+\))/i);
  if (!percentMatch || !resetMatch) {
    return undefined;
  }

  const usedPercent = Number(percentMatch[1]);
  if (!Number.isInteger(usedPercent) || usedPercent < 0 || usedPercent > 100) {
    return undefined;
  }

  const resetAt = parseClaudeResetTime(resetMatch[1], referenceDate);
  if (!resetAt) {
    return undefined;
  }

  return { usedPercent, resetAt };
}

function parseClaudeResetTime(value: string, referenceDate: Date): string | undefined {
  const timeOnly = value.match(/^(\d{1,2}):(\d{2})\s*(am|pm)\s*\(([^)]+)\)$/i);
  if (timeOnly) {
    const time = normalizeClock(Number(timeOnly[1]), Number(timeOnly[2]), timeOnly[3]);
    if (!time) {
      return undefined;
    }
    const parts = zonedParts(referenceDate, timeOnly[4]);
    if (!parts) {
      return undefined;
    }
    let reset = zonedTimeToDate(parts.year, parts.month, parts.day, time.hour, time.minute, timeOnly[4]);
    if (reset.getTime() <= referenceDate.getTime() - 60_000) {
      reset = zonedTimeToDate(parts.year, parts.month, parts.day + 1, time.hour, time.minute, timeOnly[4]);
    }
    return reset.toISOString();
  }

  const dateTime = value.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([^)]+)\)$/i);
  if (dateTime) {
    const month = monthNumber(dateTime[1]);
    const time = normalizeClock(Number(dateTime[3]), Number(dateTime[4] ?? "0"), dateTime[5]);
    const parts = zonedParts(referenceDate, dateTime[6]);
    if (!month || !time || !parts) {
      return undefined;
    }
    let reset = zonedTimeToDate(parts.year, month, Number(dateTime[2]), time.hour, time.minute, dateTime[6]);
    if (reset.getTime() <= referenceDate.getTime() - 180 * 24 * 60 * 60 * 1000) {
      reset = zonedTimeToDate(parts.year + 1, month, Number(dateTime[2]), time.hour, time.minute, dateTime[6]);
    }
    return reset.toISOString();
  }

  return undefined;
}

function normalizeClock(hour12: number, minute: number, meridiem: string): { hour: number; minute: number } | undefined {
  if (!Number.isInteger(hour12) || !Number.isInteger(minute) || hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) {
    return undefined;
  }

  const lower = meridiem.toLowerCase();
  const hour = (hour12 % 12) + (lower === "pm" ? 12 : 0);
  return { hour, minute };
}

function monthNumber(value: string): number | undefined {
  const index = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(value.slice(0, 3).toLowerCase());
  return index >= 0 ? index + 1 : undefined;
}

function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number } | undefined {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const year = get("year");
    const month = get("month");
    const day = get("day");
    return [year, month, day].every((part) => Number.isInteger(part))
      ? { year, month, day }
      : undefined;
  } catch {
    return undefined;
  }
}

function zonedTimeToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  let offset = timeZoneOffsetMinutes(new Date(utcMs), timeZone);
  utcMs = Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60_000;
  offset = timeZoneOffsetMinutes(new Date(utcMs), timeZone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60_000);
}

function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const localAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return Math.round((localAsUtc - date.getTime()) / 60_000);
}

function normalizeUsageScreen(raw: string): string {
  return raw
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, " ")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, " ")
    .replace(/[％﹪]/g, "%")
    .replace(/[\p{Separator}\u200B\u200C\u200D]+/gu, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\uFFFD+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeVersion(version: string | undefined): string | undefined {
  return version?.match(/\d+(?:\.\d+){1,3}/)?.[0]?.slice(0, 40);
}

function isOffsetIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debugClaudeTty(stage: string, fields: Record<string, boolean | number | string | null>): void {
  if (process.env.AIUW_CLAUDE_TTY_DIAGNOSTIC !== "1") {
    return;
  }

  console.log(JSON.stringify({
    diagnostic: "claude_code_tty",
    stage,
    ...fields,
  }));
}
