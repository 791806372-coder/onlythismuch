import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { Snapshot } from "../../src/contract/schema";
import {
  loadCachedSnapshot,
  saveCachedSnapshot,
  snapshotPreservingLastKnownUsage,
} from "../src/snapshot";

function baseSnapshot(): Snapshot {
  return {
    schemaVersion: 1,
    device: {
      id: "mac-test",
      name: "Test Mac",
      platform: "macOS",
      connectorVersion: "0.1.0",
      online: true,
      updatedAt: "2026-06-13T10:00:00.000Z",
    },
    providers: [
      {
        id: "claude",
        displayName: "Claude",
        connected: true,
        health: "working",
        version: "2.1.177",
        usage: {
          available: false,
          reason: "no_stable_source",
        },
      },
      {
        id: "codex",
        displayName: "Codex",
        connected: true,
        health: "working",
        version: "0.139.0",
        usage: {
          available: false,
          reason: "no_stable_source",
        },
      },
    ],
  };
}

function withClaudeUsage(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    providers: snapshot.providers.map((provider) => provider.id === "claude"
      ? {
          ...provider,
          capturedAt: "2026-06-13T09:59:00.000Z",
          usage: {
            available: true,
            source: "claude_code_tty",
            sourceVersion: "2.1.177",
            fiveHourRemainingPercent: 97,
            fiveHourResetAt: "2026-06-13T12:39:00.000Z",
            weeklyRemainingPercent: 100,
            weeklyResetAt: "2026-06-16T02:59:00.000Z",
          },
        }
      : provider),
  };
}

test("preserves previous real usage when a connected provider temporarily loses its stable source", () => {
  const previous = withClaudeUsage(baseSnapshot());
  const current = baseSnapshot();
  const preserved = snapshotPreservingLastKnownUsage(current, previous);
  const claude = preserved.providers.find((provider) => provider.id === "claude");

  assert.equal(claude?.capturedAt, "2026-06-13T09:59:00.000Z");
  assert.equal(claude?.usage.available, true);
  if (claude?.usage.available) {
    assert.equal(claude.usage.source, "claude_code_tty");
    assert.equal(claude.usage.fiveHourRemainingPercent, 97);
    assert.equal(claude.usage.weeklyRemainingPercent, 100);
  }
});

test("does not preserve previous usage when the provider is logged out", () => {
  const previous = withClaudeUsage(baseSnapshot());
  const current = {
    ...baseSnapshot(),
    providers: baseSnapshot().providers.map((provider) => provider.id === "claude"
      ? {
          ...provider,
          connected: false,
          health: "error" as const,
          usage: {
            available: false as const,
            reason: "not_logged_in" as const,
          },
        }
      : provider),
  };
  const preserved = snapshotPreservingLastKnownUsage(current, previous);
  const claude = preserved.providers.find((provider) => provider.id === "claude");

  assert.equal(claude?.capturedAt, undefined);
  assert.deepEqual(claude?.usage, {
    available: false,
    reason: "not_logged_in",
  });
});

test("snapshot cache stores only schema-validated sanitized snapshots", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-snapshot-test-"));
  const paths = { dir, file: path.join(dir, "config.json") };
  const snapshot = withClaudeUsage(baseSnapshot());

  saveCachedSnapshot(snapshot, paths);
  assert.deepEqual(loadCachedSnapshot(paths), snapshot);
  assert.equal(fs.statSync(path.join(dir, "last-snapshot.json")).mode & 0o077, 0);

  fs.rmSync(dir, { recursive: true, force: true });
});
