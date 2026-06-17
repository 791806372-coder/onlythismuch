import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { collectCurrentSnapshot } = require("../connector/dist/connector/src/collectors.js");

const originalPath = process.env.PATH;
const token = `smoke-token-${Date.now()}`;

try {
  process.env.PATH = "/usr/bin:/bin";
  const snapshot = await collectCurrentSnapshot({
    version: 1,
    deviceId: "real-collector-smoke",
    name: "Real Collector Smoke",
    token,
    updatedAt: new Date().toISOString()
  });

  const providerIds = snapshot.providers.map((provider) => provider.id);
  if (providerIds.join(",") !== "claude,codex") {
    throw new Error(`Unexpected provider list: ${providerIds.join(",")}`);
  }

  for (const provider of snapshot.providers) {
    if (provider.usage.available) {
      throw new Error(`${provider.id} reported usage without an explicit usage source`);
    }
    if ("capturedAt" in provider) {
      throw new Error(`${provider.id} emitted capturedAt without proven usage`);
    }
    if ("fiveHourRemainingPercent" in provider.usage || "weeklyRemainingPercent" in provider.usage) {
      throw new Error(`${provider.id} leaked usage percentages in Tier 0 mode`);
    }
  }

  const serialized = JSON.stringify(snapshot);
  for (const forbidden of [token, "Authorization", "Bearer", "cookie", "transcript"]) {
    if (serialized.toLowerCase().includes(forbidden.toLowerCase())) {
      throw new Error(`Real collector snapshot contained forbidden text: ${forbidden}`);
    }
  }

  const summary = snapshot.providers.map((provider) => ({
    id: provider.id,
    connected: provider.connected,
    health: provider.health,
    version: provider.version ?? null,
    usage: provider.usage.reason,
    error: provider.error?.code ?? null
  }));

  console.log(JSON.stringify({
    ok: true,
    mode: "tier0-real-collectors",
    note: "No usage capturedAt or percentages are emitted without an explicit usage source.",
    providers: summary
  }, null, 2));
} finally {
  process.env.PATH = originalPath;
}
