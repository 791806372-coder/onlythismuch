import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectCodexBarUsage } = require("../connector/dist/connector/src/codexbar.js");
const { runLimitedCommand } = require("../connector/dist/connector/src/collectors.js");

const PROVIDER_IDS = ["claude", "codex"];
const EMAIL_VALUE_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const FORBIDDEN_TEXT_RE = /authorization|bearer|cookie|transcript|apitoken|secret|credential/i;

const commandResults = [];

const runner = async (command, args, options) => {
  const result = await runLimitedCommand(command, args, options);
  commandResults.push({
    command,
    args,
    status: result.status,
    exitCode: result.exitCode ?? null,
    timeoutMs: options.timeoutMs,
    maxOutputBytes: options.maxOutputBytes,
  });
  return result;
};

const overlay = await collectCodexBarUsage(runner);
const usageCommand = commandResults.find(
  (result) => result.command === "codexbar" && result.args[0] === "usage"
);
const providers = PROVIDER_IDS.map((id) => summarizeProvider(id, overlay[id]));
const usageVerified = providers.some((provider) => provider.usageAvailable);
const payload = {
  ok: true,
  mode: "codexbar-live-probe",
  usageVerified,
  skipped: usageCommand?.status === "not_found",
  reason: reasonFor(usageCommand, usageVerified),
  commands: stableCommandResults(commandResults),
  providers,
  note: "No raw CodexBar stdout or stderr is printed.",
};

const serialized = JSON.stringify(payload, null, 2);
if (EMAIL_VALUE_RE.test(serialized) || FORBIDDEN_TEXT_RE.test(serialized)) {
  throw new Error("CodexBar probe output contained forbidden text");
}

console.log(serialized);

function summarizeProvider(id, overlayEntry) {
  if (!overlayEntry?.usage?.available) {
    return {
      id,
      usageAvailable: false,
    };
  }

  return {
    id,
    usageAvailable: true,
    source: overlayEntry.usage.source,
    sourceVersion: overlayEntry.usage.sourceVersion ?? null,
    fiveHourRemainingPercent: overlayEntry.usage.fiveHourRemainingPercent,
    weeklyRemainingPercent: overlayEntry.usage.weeklyRemainingPercent,
    resetTimesPresent: Boolean(
      overlayEntry.usage.fiveHourResetAt && overlayEntry.usage.weeklyResetAt
    ),
  };
}

function reasonFor(usageCommand, usageVerified) {
  if (usageVerified) {
    return null;
  }
  if (!usageCommand) {
    return "codexbar_probe_not_run";
  }
  if (usageCommand.status === "not_found") {
    return "codexbar_not_found";
  }
  if (usageCommand.status !== "ok") {
    return `codexbar_usage_${usageCommand.status}`;
  }
  return "codexbar_returned_no_allowlisted_usage";
}

function stableCommandResults(results) {
  return [...results].sort((a, b) => {
    const left = [a.command, ...a.args].join(" ");
    const right = [b.command, ...b.args].join(" ");
    return left.localeCompare(right);
  });
}
