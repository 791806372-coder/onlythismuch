import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SnapshotSchema,
  assertSafeSnapshot,
  parseSnapshot,
  type Snapshot,
} from "../src/contract/schema.ts";

const userFixtureNames = [
  "normal.json",
  "degraded.json",
  "offline.json",
  "not_logged_in.json",
  "error.json",
  "stale.json",
];
const internalFixtureNames = [
  "internal_meter_layout.json",
  "internal_stale_meter_layout.json",
];
const fixtureNames = [...userFixtureNames, ...internalFixtureNames];

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join("fixtures", name), "utf8"));
}

describe("snapshot contract", () => {
  for (const name of fixtureNames) {
    it(`validates ${name}`, () => {
      const parsed = parseSnapshot(loadFixture(name));
      assert.equal(parsed.schemaVersion, 1);
    });
  }

  it("keeps Claude fixture usage unavailable until a stable source exists", () => {
    for (const name of fixtureNames) {
      const parsed = parseSnapshot(loadFixture(name));
      const claude = parsed.providers.find((provider) => provider.id === "claude");
      assert.ok(claude, `missing Claude provider in ${name}`);
      assert.equal(claude.usage.available, false, name);
      assert.equal(claude.capturedAt ?? null, null, name);
      assert.equal(claude.usage.source ?? null, null, name);
      assert.equal(claude.usage.sourceVersion ?? null, null, name);
      assert.equal(claude.usage.fiveHourRemainingPercent ?? null, null, name);
      assert.equal(claude.usage.fiveHourResetAt ?? null, null, name);
      assert.equal(claude.usage.weeklyRemainingPercent ?? null, null, name);
      assert.equal(claude.usage.weeklyResetAt ?? null, null, name);
      assert.ok(claude.usage.reason, name);
    }
  });

  it("keeps user-cacheable fixtures free of fake usage percentages", () => {
    for (const name of userFixtureNames) {
      const parsed = parseSnapshot(loadFixture(name));
      for (const provider of parsed.providers) {
        assert.equal(provider.usage.available, false, `${name}:${provider.id}`);
        assert.equal(provider.capturedAt ?? null, null, `${name}:${provider.id}`);
        assert.equal(provider.usage.source ?? null, null, `${name}:${provider.id}`);
        assert.equal(provider.usage.sourceVersion ?? null, null, `${name}:${provider.id}`);
        assert.equal(provider.usage.fiveHourRemainingPercent ?? null, null, `${name}:${provider.id}`);
        assert.equal(provider.usage.fiveHourResetAt ?? null, null, `${name}:${provider.id}`);
        assert.equal(provider.usage.weeklyRemainingPercent ?? null, null, `${name}:${provider.id}`);
        assert.equal(provider.usage.weeklyResetAt ?? null, null, `${name}:${provider.id}`);
        assert.ok(provider.usage.reason, `${name}:${provider.id}`);
      }
    }
  });

  it("rejects unknown usage sources", () => {
    const snapshot = loadFixture("internal_meter_layout.json") as Snapshot;
    const codex = snapshot.providers.find((provider) => provider.id === "codex");
    assert.ok(codex);
    codex.usage = {
      ...codex.usage,
      source: "mystery_source",
    } as Snapshot["providers"][number]["usage"];

    assert.throws(() => SnapshotSchema.parse(snapshot), /Invalid enum value/);
  });

  it("accepts vetted Codex app-server usage source", () => {
    const snapshot = loadFixture("internal_meter_layout.json") as Snapshot;
    const codex = snapshot.providers.find((provider) => provider.id === "codex");
    assert.ok(codex);
    codex.usage = {
      ...codex.usage,
      source: "codex_app_server",
    } as Snapshot["providers"][number]["usage"];

    assert.equal(SnapshotSchema.parse(snapshot).providers[1].usage.source, "codex_app_server");
  });

  it("accepts vetted Claude Code TTY usage source", () => {
    const snapshot = loadFixture("internal_meter_layout.json") as Snapshot;
    const claude = snapshot.providers.find((provider) => provider.id === "claude");
    assert.ok(claude);
    claude.capturedAt = "2026-06-11T18:10:22Z";
    claude.usage = {
      available: true,
      source: "claude_code_tty",
      sourceVersion: "2.1.177",
      fiveHourRemainingPercent: 98,
      fiveHourResetAt: "2026-06-13T12:39:00Z",
      weeklyRemainingPercent: 100,
      weeklyResetAt: "2026-06-16T02:59:00Z",
    } as Snapshot["providers"][number]["usage"];

    assert.equal(SnapshotSchema.parse(snapshot).providers[0].usage.source, "claude_code_tty");
  });

  it("rejects future usage sources before adapters exist", () => {
    for (const source of ["sessions_jsonl", "provider_api"]) {
      const snapshot = loadFixture("internal_meter_layout.json") as Snapshot;
      const codex = snapshot.providers.find((provider) => provider.id === "codex");
      assert.ok(codex);
      codex.usage = {
        ...codex.usage,
        source,
      } as Snapshot["providers"][number]["usage"];

      assert.throws(() => SnapshotSchema.parse(snapshot), /Invalid enum value/);
    }
  });

  it("rejects future provider ids in the V1 widget contract", () => {
    const snapshot = loadFixture("normal.json") as Snapshot;
    snapshot.providers[0].id = "hermes" as Snapshot["providers"][number]["id"];

    assert.throws(() => SnapshotSchema.parse(snapshot), /Invalid enum value/);
  });

  it("requires exactly one Claude and one Codex provider", () => {
    const missingCodex = loadFixture("normal.json") as Snapshot;
    missingCodex.providers = missingCodex.providers.filter((provider) => provider.id !== "codex");

    assert.throws(() => SnapshotSchema.parse(missingCodex), /Array must contain exactly 2 element/);

    const duplicateClaude = loadFixture("normal.json") as Snapshot;
    duplicateClaude.providers[1] = {
      ...duplicateClaude.providers[0],
    };

    assert.throws(() => SnapshotSchema.parse(duplicateClaude), /exactly one Claude provider and one Codex provider/);
  });

  it("rejects unknown schema fields", () => {
    const snapshot = loadFixture("normal.json") as Snapshot & {
      surprise?: string;
    };
    snapshot.surprise = "nope";

    assert.throws(() => SnapshotSchema.parse(snapshot), /Unrecognized key/);
  });

  it("rejects approval fields inside the usage snapshot", () => {
    const snapshot = loadFixture("normal.json") as Snapshot & {
      approval?: unknown;
    };
    snapshot.approval = {
      requestId: "fixture-approval",
      action: "approve",
    };

    assert.throws(() => SnapshotSchema.parse(snapshot), /Unrecognized key/);
  });

  it("rejects account metadata inside the V1 usage snapshot", () => {
    const snapshot = loadFixture("normal.json") as Snapshot;
    (snapshot.providers[0] as Snapshot["providers"][number] & {
      account?: unknown;
    }).account = {
      plan: "pro",
    };

    assert.throws(() => SnapshotSchema.parse(snapshot), /Unrecognized key/);
  });

  it("rejects a rendered percent without source and capturedAt", () => {
    const snapshot = loadFixture("normal.json") as Snapshot;
    delete (snapshot.providers[0] as Partial<Snapshot["providers"][number]>)
      .capturedAt;
    snapshot.providers[0].usage = {
      available: true,
      fiveHourRemainingPercent: 50,
      fiveHourResetAt: "2026-06-11T23:10:00+08:00",
      weeklyRemainingPercent: 77,
      weeklyResetAt: "2026-06-12T14:00:00+08:00",
    } as Snapshot["providers"][number]["usage"];

    assert.throws(() => SnapshotSchema.parse(snapshot));
  });

  it("rejects unavailable usage fields even when they are null", () => {
    const snapshot = loadFixture("normal.json") as Snapshot;
    snapshot.providers[0].usage = {
      ...snapshot.providers[0].usage,
      fiveHourRemainingPercent: null,
    } as Snapshot["providers"][number]["usage"];

    assert.throws(() => parseSnapshot(snapshot), /Unrecognized key/);
  });

  it("rejects unavailable provider capturedAt even when health/version are known", () => {
    const snapshot = loadFixture("normal.json") as Snapshot;
    snapshot.providers[0].capturedAt = "2026-06-11T19:29:41+08:00";

    assert.throws(() => SnapshotSchema.parse(snapshot), /capturedAt is only allowed when usage is available/);
  });

  it("rejects forbidden secret-like raw keys before parsing", () => {
    const snapshot = loadFixture("normal.json") as Snapshot;
    (snapshot.providers[0] as Snapshot["providers"][number] & {
      apiToken?: string;
    }).apiToken = "do-not-ship";

    assert.throws(() => parseSnapshot(snapshot), /forbidden key/i);
  });

  it("rejects suspiciously long strings", () => {
    const snapshot = loadFixture("normal.json") as Snapshot;
    snapshot.providers[0].error = {
      code: "collector_error",
      message: "x".repeat(201),
    };

    assert.throws(() => assertSafeSnapshot(snapshot), /string too long/i);
  });

  it("rejects email-like string values", () => {
    const snapshot = loadFixture("normal.json") as Snapshot;
    snapshot.device.name = "kai@example.com";

    assert.throws(() => parseSnapshot(snapshot), /email-like value/i);
  });

  it("rejects network-like string values before the phone sees them", () => {
    for (const value of [
      "http://192.168.1.8:8787",
      "https://example.com/status",
      "localhost",
      "kais-mac.local",
      "192.168.1.8",
    ]) {
      const snapshot = loadFixture("normal.json") as Snapshot;
      snapshot.providers[0].displayName = value;

      assert.throws(() => parseSnapshot(snapshot), /network-like value/i, value);
    }
  });

  it("rejects secret-like string values even under allowed keys", () => {
    for (const value of [
      "Bearer secret-token",
      "Authorization: Bearer nope",
      "apiToken leaked",
      "cookie session",
      "password=hunter2",
      "passphrase: do-not-ship",
      "transcript raw provider output",
    ]) {
      const snapshot = loadFixture("normal.json") as Snapshot;
      snapshot.providers[0].error = {
        code: "collector_error",
        message: value,
      };

      assert.throws(() => parseSnapshot(snapshot), /forbidden value/i, value);
    }
  });
});
