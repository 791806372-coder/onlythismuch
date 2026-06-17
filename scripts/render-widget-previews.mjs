import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const fixturesDir = path.join(repoRoot, "fixtures");
const outputDir = path.join(repoRoot, "outputs", "widget-previews");
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
const fixturePreviews = [
  ...userFixtureNames.map((fixtureName) => ({
    section: "User Fixtures",
    fixtureName,
    outputName: fixtureName.replace(".json", ""),
    cacheSource: `fixture:${fixtureName.replace(".json", "")}`,
  })),
  ...internalFixtureNames.map((fixtureName) => ({
    section: "Internal Layout Fixtures",
    fixtureName,
    outputName: fixtureName.replace(".json", ""),
    internalLabel: fixtureName === "internal_meter_layout.json" ? "Internal · Layout" : "Internal · 旧账",
  })),
  {
    section: "Device Proof States",
    fixtureName: "degraded.json",
    outputName: "no_cache_fallback",
    isPreviewFallback: true,
  },
  {
    section: "Device Proof States",
    fixtureName: "normal.json",
    outputName: "proof_mode",
    appGroupProofMode: true,
    appGroupProof: "Proof 12:34:56",
  },
  {
    section: "Device Proof States",
    fixtureName: "normal.json",
    outputName: "lan_cache",
    cacheSource: "lan",
  },
  {
    section: "Device Proof States",
    fixtureName: "normal.json",
    outputName: "widget_lan_cache",
    cacheSource: "widget-lan",
  },
  {
    section: "Device Proof States",
    fixtureName: "normal.json",
    outputName: "old_fixture_cache",
    cacheSource: "fixture:normal",
    cacheSavedAt: "2026-06-09T19:30:00+08:00",
  },
  {
    section: "Device Proof States",
    fixtureName: "normal.json",
    outputName: "approval_pending",
    cacheSource: "fixture:approval",
    approvalRequest: true,
  },
  {
    section: "Device Proof States",
    fixtureName: "internal_meter_layout.json",
    outputName: "old_meter_cache",
    cacheSource: "lan",
    cacheSavedAt: "2026-06-11T15:30:00+08:00",
  },
];

const { parseSnapshot } = await import(pathToFileURL(path.join(repoRoot, "src/contract/schema.ts")).href);

fs.mkdirSync(outputDir, { recursive: true });
const generated = [];

for (const preview of fixturePreviews) {
  const fixturePath = path.join(fixturesDir, preview.fixtureName);
  const snapshot = parseSnapshot(JSON.parse(fs.readFileSync(fixturePath, "utf8")));
  const svg = renderWidget(snapshot, preview);
  const outputPath = path.join(outputDir, `${preview.outputName}.svg`);
  fs.writeFileSync(outputPath, svg);
  generated.push({
    section: preview.section,
    preview,
    file: path.relative(repoRoot, outputPath),
  });
}

const index = [
  "# AI Usage Widget Previews",
  "",
  "Generated from root fixtures with `npm run render:widget-previews`.",
  "The six user fixtures are safe for app/mock cache review and do not contain fake usage percentages.",
  "Internal meter previews are layout/test aids only. Device proof previews mirror important header states, but real WidgetKit proof still requires iPhone screenshots.",
  "",
  ...["User Fixtures", "Internal Layout Fixtures", "Device Proof States"].flatMap((section) => [
    `## ${section}`,
    "",
    ...generated
      .filter((item) => item.section === section)
      .map((item) => `- [${path.basename(item.file)}](${path.basename(item.file)})`),
    "",
  ]),
  "",
].join("\n");
fs.writeFileSync(path.join(outputDir, "README.md"), index);

validateGeneratedPreviews(generated);

console.log(`Generated ${generated.length} widget preview SVGs in ${path.relative(repoRoot, outputDir)}`);

function validateGeneratedPreviews(items) {
  const failures = [];
  const expectedHeader = "别问了 还剩这么点 🤏";
  const safeNoMeterOutputs = new Set([
    ...userFixtureNames.map((fixtureName) => fixtureName.replace(".json", "")),
    "no_cache_fallback",
    "proof_mode",
    "lan_cache",
    "widget_lan_cache",
    "old_fixture_cache",
    "approval_pending",
  ]);
  const deferredProviderPattern = new RegExp([
    ["Her", "mes"].join(""),
    ["Open", "Claw"].join(""),
  ].join("|"), "i");

  for (const item of items) {
    const svg = fs.readFileSync(path.join(repoRoot, item.file), "utf8");
    const name = path.basename(item.file);
    const missing = [];
    if (!svg.includes(expectedHeader)) {
      missing.push("fixed header");
    }
    if (!svg.includes("Claude")) {
      missing.push("Claude label");
    }
    if (!svg.includes("Codex")) {
      missing.push("Codex label");
    }
    if (/\ballow(?:ance|rance)\b/i.test(svg)) {
      missing.push("usage wording drift");
    }
    if (deferredProviderPattern.test(svg)) {
      missing.push("deferred provider label");
    }
    if (safeNoMeterOutputs.has(item.preview.outputName) && /\d+%/.test(svg)) {
      missing.push("fake percentage in safe preview");
    }
    if (missing.length > 0) {
      failures.push(`${name}: ${missing.join(", ")}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Generated widget preview invariant failure:\n${failures.join("\n")}`);
  }
}

function renderWidget(snapshot, preview) {
  const width = 760;
  const height = 340;
  const id = preview.outputName;
  const providers = ["claude", "codex"]
    .map((providerId) => snapshot.providers.find((provider) => provider.id === providerId))
    .filter(Boolean);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="AI Usage Widget ${escapeXml(id)} preview">
  <rect width="${width}" height="${height}" rx="38" fill="#1b1b1d"/>
  <g>
    <text x="32" y="58" fill="#f7f7f8" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="28" font-weight="700">别问了 还剩这么点 🤏</text>
    ${preview.approvalRequest
      ? renderApprovalHeader(preview)
      : renderRefreshHeaderButton(708)}
    ${providers.map((provider, index) => renderProvider(provider, snapshot, index, preview)).join("\n")}
    <rect x="379" y="105" width="2" height="148" rx="1" fill="#3b3b3d"/>
  </g>
</svg>
`;
}

function renderRefreshHeaderButton(x) {
  return `<g>
    <rect x="${x}" y="35" width="34" height="30" rx="9" fill="#333337" stroke="#4b4b50" stroke-width="2"/>
    <text x="${x + 17}" y="56" text-anchor="middle" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="18" font-weight="800">↻</text>
  </g>`;
}

function renderApprovalHeader(preview) {
  const label = preview.localApprovalFixture ? "本地测😏" : "Mac待批🙃";
  const labelColor = preview.localApprovalFixture ? "#8f8f94" : "#f5a33b";
  return `<g>
    <text x="548" y="58" fill="${labelColor}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="18" font-weight="700">${escapeXml(label)}</text>
    <rect x="615" y="35" width="34" height="30" rx="9" fill="#254f37" stroke="#36d46b" stroke-width="2"/>
    <text x="632" y="56" text-anchor="middle" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="18" font-weight="800">✓</text>
    <rect x="662" y="35" width="34" height="30" rx="9" fill="#562929" stroke="#ff5f57" stroke-width="2"/>
    <text x="679" y="56" text-anchor="middle" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="18" font-weight="800">×</text>
    ${renderRefreshHeaderButton(709)}
  </g>`;
}

function renderProvider(provider, snapshot, index, preview) {
  const x = index === 0 ? 32 : 430;
  const color = provider.id === "codex" ? "#10A37F" : "#e9946c";
  const body = isRenderableMeter(provider)
    ? [
        renderMeter(x, 150, "5h", provider.usage.fiveHourRemainingPercent, provider.usage.fiveHourResetAt, snapshot, provider, preview),
        renderMeter(x, 222, "周", provider.usage.weeklyRemainingPercent, provider.usage.weeklyResetAt, snapshot, provider, preview),
      ].join("\n")
    : renderFallback(x, provider, snapshot);

  return `<g>
    <text x="${x}" y="118" fill="${color}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="26" font-weight="700">${escapeXml(provider.displayName)}</text>
    ${body}
  </g>`;
}

function isRenderableMeter(provider) {
  return Boolean(provider.usage.available && provider.usage.source && provider.capturedAt);
}

function renderMeter(x, y, title, percent, resetAt, snapshot, provider, preview) {
  const value = clamp(Number(percent), 0, 100);
  const barColor = value >= 60 ? "#36d46b" : value >= 30 ? "#ffad2f" : "#ff5f57";
  const reset = isProviderStale(snapshot, provider, preview)
    ? "旧账别太信🧊"
    : `${formatReset(resetAt, snapshot.device.updatedAt)} 恢复`;
  return `<g>
    <text x="${x}" y="${y}" fill="#8f8f94" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="21"> ${escapeXml(title)}</text>
    <rect x="${x + 48}" y="${y - 16}" width="156" height="16" rx="8" fill="#4b4b4d"/>
    <rect x="${x + 48}" y="${y - 16}" width="${Math.round(156 * value / 100)}" height="16" rx="8" fill="${barColor}"/>
    <text x="${x + 220}" y="${y}" fill="#f7f7f8" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="23" font-weight="700">${value}%</text>
    <text x="${x + 18}" y="${y + 34}" fill="#8f8f94" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="18">${escapeXml(reset)}</text>
  </g>`;
}

function renderFallback(x, provider, snapshot) {
  const copy = fallbackCopy(provider, snapshot);
  return `<g>
    <text x="${x}" y="166" fill="#f7f7f8" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="23" font-weight="700">${escapeXml(copy.title)}</text>
    <text x="${x}" y="202" fill="#8f8f94" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif" font-size="19">${escapeXml(copy.subtitle)}</text>
  </g>`;
}

function fallbackCopy(provider, snapshot) {
  const seedDate = new Date(snapshot.device.updatedAt);
  switch (provider.usage.reason) {
    case "third_party_no_quota":
      return { title: "无表可看😏", subtitle: rotate(["走的野路子😏", "没用量账本"], seedDate) };
    case "not_logged_in":
      return { title: "没登录还想看？😒", subtitle: "去 Mac 上登录" };
    case "collector_error":
      return { title: "探测翻车了🤡", subtitle: rotate(["接口又演了", "又是探测的锅"], seedDate) };
    case "no_stable_source":
    default:
      if (!provider.connected) {
        return { title: "没登录还想看？😒", subtitle: "去 Mac 上登录" };
      }
      return { title: "用量装神秘🙄", subtitle: rotate(["官方又藏了", "就不给看"], seedDate) };
  }
}

function isProviderStale(snapshot, provider, preview = {}) {
  const staleMs = 3 * 60 * 60 * 1000;
  const now = Date.parse(preview.now ?? snapshot.device.updatedAt);
  const snapshotUpdatedAt = Date.parse(snapshot.device.updatedAt);
  const cacheSavedAt = Date.parse(preview.cacheSavedAt ?? snapshot.device.updatedAt);
  if (now - cacheSavedAt > staleMs || now - snapshotUpdatedAt > staleMs) {
    return true;
  }
  if (!provider.capturedAt) {
    return false;
  }
  const capturedAt = Date.parse(provider.capturedAt);
  return snapshotUpdatedAt - capturedAt > staleMs || now - capturedAt > staleMs;
}

function formatReset(value, snapshotUpdatedAt) {
  if (!value) {
    return "用量装神秘🙄";
  }
  const reset = new Date(value);
  const updatedAt = new Date(snapshotUpdatedAt);
  if (reset.toDateString() === updatedAt.toDateString()) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Shanghai",
    }).format(reset);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Shanghai",
  }).format(reset).replace("/", "月") + "日";
}

function rotate(values, date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return values[Math.abs(day) % values.length];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
