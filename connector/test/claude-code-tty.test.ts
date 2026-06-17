import assert from "node:assert/strict";
import test from "node:test";
import { parseClaudeCodeUsageScreen } from "../src/claudeCodeTty";

const referenceDate = new Date("2026-06-13T07:40:00.000Z");

test("parses Claude Code usage hardcopy into sanitized usage overlay", () => {
  const overlay = parseClaudeCodeUsageScreen(`
    Claude Code v2.1.177
    Sonnet 4.6 · Claude Pro ·
    Settings Status Config Usage Stats

    Session
    Total cost: $0.0000
    Usage: 0 input, 0 output, 0 cache read, 0 cache write

    Current session
    █ 2% used
    Resets 8:39pm (Asia/Shanghai)

    Current week (all models)
    0% used
    Resets Jun 16 at 10:59am (Asia/Shanghai)

    What's contributing to your limits usage?
    Approximate, based on local sessions on this machine — does not include other devices or claude.ai
  `, referenceDate);

  assert.equal(overlay.claude?.capturedAt, "2026-06-13T07:40:00.000Z");
  assert.equal(overlay.claude?.version, "2.1.177");
  assert.equal(overlay.claude?.usage.available, true);
  if (overlay.claude?.usage.available) {
    assert.equal(overlay.claude.usage.source, "claude_code_tty");
    assert.equal(overlay.claude.usage.sourceVersion, "2.1.177");
    assert.equal(overlay.claude.usage.fiveHourRemainingPercent, 98);
    assert.equal(overlay.claude.usage.fiveHourResetAt, "2026-06-13T12:39:00.000Z");
    assert.equal(overlay.claude.usage.weeklyRemainingPercent, 100);
    assert.equal(overlay.claude.usage.weeklyResetAt, "2026-06-16T02:59:00.000Z");
  }
});

test("ignores Claude Code screens without both usage windows", () => {
  assert.deepEqual(parseClaudeCodeUsageScreen("Claude Code v2.1.177\nCurrent session 2% used", referenceDate), {});
});

test("accepts official usage credits marker when plan label is cropped", () => {
  const overlay = parseClaudeCodeUsageScreen(`
    Claude Code v2.1.177
    Settings Status Config Usage Stats
    Current session
    3% used
    Resets 8:39pm (Asia/Shanghai)
    Current week (all models)
    0% used
    Resets Jun 16 at 10:59am (Asia/Shanghai)
    Usage credits
    Usage credits are off · /usage-credits to turn them on
  `, referenceDate);

  assert.equal(overlay.claude?.usage.available, true);
  if (overlay.claude?.usage.available) {
    assert.equal(overlay.claude.usage.fiveHourRemainingPercent, 97);
    assert.equal(overlay.claude.usage.weeklyRemainingPercent, 100);
  }
});

test("parses usage percents with invisible terminal spacing", () => {
  const overlay = parseClaudeCodeUsageScreen(`
    Claude Code v2.1.177
    Settings Status Config Usage Stats
    Current session
    2% used
    Resets 8:39pm (Asia/Shanghai)
    Current week (all models)
    2%\u200Bused
    Resets Jun 16 at 10:59am (Asia/Shanghai)
    Usage credits
  `, referenceDate);

  assert.equal(overlay.claude?.usage.available, true);
  if (overlay.claude?.usage.available) {
    assert.equal(overlay.claude.usage.fiveHourRemainingPercent, 98);
    assert.equal(overlay.claude.usage.weeklyRemainingPercent, 98);
  }
});

test("rejects usage bars without an official Claude plan marker", () => {
  const overlay = parseClaudeCodeUsageScreen(`
    Claude Code v2.1.177
    Settings Status Config Usage Stats
    Current session
    2% used
    Resets 8:39pm (Asia/Shanghai)
    Current week (all models)
    0% used
    Resets Jun 16 at 10:59am (Asia/Shanghai)
    What's contributing
  `, referenceDate);

  assert.deepEqual(overlay, {});
});

test("rejects impossible Claude Code usage percents", () => {
  const overlay = parseClaudeCodeUsageScreen(`
    Claude Pro
    Current session 101% used
    Resets 8:39pm (Asia/Shanghai)
    Current week (all models) 0% used
    Resets Jun 16 at 10:59am (Asia/Shanghai)
    What's contributing
  `, referenceDate);

  assert.deepEqual(overlay, {});
});
