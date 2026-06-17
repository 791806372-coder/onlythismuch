import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SnapshotSchema, type Snapshot } from "../src/contract/schema.ts";
import {
  classifyProviderDisplay,
  classifySnapshotDisplay,
  type ProviderDisplayState,
} from "../src/contract/display-state.ts";

function fixture(name: string): Snapshot {
  return SnapshotSchema.parse(
    JSON.parse(readFileSync(join("fixtures", name), "utf8")),
  );
}

describe("display state coverage", () => {
  it("classifies all seven display states from fixtures", () => {
    const states = new Set<ProviderDisplayState | "offline">();

    for (const name of [
      "normal.json",
      "degraded.json",
      "offline.json",
      "not_logged_in.json",
      "error.json",
      "stale.json",
      "internal_meter_layout.json",
      "internal_stale_meter_layout.json",
    ]) {
      const snapshot = fixture(name);
      states.add(classifySnapshotDisplay(snapshot));
      for (const provider of snapshot.providers) {
        states.add(classifyProviderDisplay(snapshot, provider));
      }
    }

    assert.deepEqual([...states].sort(), [
      "collector_error",
      "fresh",
      "no_meter",
      "not_logged_in",
      "offline",
      "stale",
      "unknown_usage",
    ]);
  });
});
