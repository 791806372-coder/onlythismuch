import fs from "node:fs";
import path from "node:path";
import { getConfigPaths, type ConfigPaths } from "./config";
import {
  parseSnapshot,
  type Snapshot,
} from "../../src/contract/schema";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function loadMockSnapshot(fixturePath: string): Snapshot {
  const resolved = path.resolve(process.cwd(), fixturePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = JSON.parse(raw) as JsonValue;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Mock snapshot must be a JSON object");
  }

  return parseSnapshot(parsed);
}

export function getSnapshotCachePath(paths: ConfigPaths = getConfigPaths()): string {
  return path.join(paths.dir, "last-snapshot.json");
}

export function loadCachedSnapshot(paths: ConfigPaths = getConfigPaths()): Snapshot | undefined {
  const cachePath = getSnapshotCachePath(paths);
  if (!fs.existsSync(cachePath)) {
    return undefined;
  }

  try {
    return parseSnapshot(JSON.parse(fs.readFileSync(cachePath, "utf8")) as JsonValue);
  } catch {
    return undefined;
  }
}

export function saveCachedSnapshot(snapshot: Snapshot, paths: ConfigPaths = getConfigPaths()): void {
  const parsed = parseSnapshot(snapshot);
  fs.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(paths.dir, 0o700);
  const cachePath = getSnapshotCachePath(paths);
  fs.writeFileSync(cachePath, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.chmodSync(cachePath, 0o600);
}

export function snapshotPreservingLastKnownUsage(
  snapshot: Snapshot,
  previous: Snapshot | undefined
): Snapshot {
  if (!previous) {
    return parseSnapshot(snapshot);
  }

  return parseSnapshot({
    ...snapshot,
    providers: snapshot.providers.map((provider) => {
      if (
        provider.usage.available ||
        !provider.connected ||
        (provider.usage.reason !== "no_stable_source" && provider.usage.reason !== "collector_error")
      ) {
        return provider;
      }

      const previousProvider = previous.providers.find((candidate) => candidate.id === provider.id);
      if (!previousProvider?.usage.available || !previousProvider.capturedAt) {
        return provider;
      }

      return {
        ...provider,
        version: provider.version ?? previousProvider.version,
        capturedAt: previousProvider.capturedAt,
        usage: previousProvider.usage,
        error: provider.error,
      };
    }),
  });
}
