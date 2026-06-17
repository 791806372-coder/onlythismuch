import type { Snapshot } from "./schema.ts";

export type ProviderDisplayState =
  | "fresh"
  | "stale"
  | "unknown_usage"
  | "no_meter"
  | "not_logged_in"
  | "collector_error";

const STALE_PROVIDER_MS = 3 * 60 * 60 * 1000;

export function classifySnapshotDisplay(snapshot: Snapshot): "fresh" | "offline" {
  return snapshot.device.online ? "fresh" : "offline";
}

export function classifyProviderDisplay(
  snapshot: Snapshot,
  provider: Snapshot["providers"][number],
): ProviderDisplayState {
  if (
    !provider.connected ||
    (!provider.usage.available && provider.usage.reason === "not_logged_in")
  ) {
    return "not_logged_in";
  }

  if (provider.usage.available) {
    if (provider.capturedAt && isProviderStale(snapshot, provider.capturedAt)) {
      return "stale";
    }
    return "fresh";
  }

  if (provider.usage.reason === "third_party_no_quota") {
    return "no_meter";
  }

  if (provider.usage.reason === "collector_error") {
    return "collector_error";
  }

  return "unknown_usage";
}

function isProviderStale(snapshot: Snapshot, capturedAt: string): boolean {
  const updatedAtMs = Date.parse(snapshot.device.updatedAt);
  const capturedAtMs = Date.parse(capturedAt);
  return updatedAtMs - capturedAtMs > STALE_PROVIDER_MS;
}
