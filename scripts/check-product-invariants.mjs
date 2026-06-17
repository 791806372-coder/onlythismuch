import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const rows = [];

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
const runtimeScanRoots = [
  "src",
  "connector/src",
  "ios/Shared",
  "ios/AIUsageWidgetApp",
  "ios/AIUsageWidgetExtension",
  "fixtures",
  "scripts/render-widget-previews.mjs",
];

const { parseSnapshot } = await import(pathToFileURL(path.join(repoRoot, "src/contract/schema.ts")).href);

function record(status, name, detail) {
  rows.push({ status, name, detail });
}

function pass(name, detail) {
  record("PASS", name, detail);
}

function fail(name, detail) {
  record("FAIL", name, detail);
}

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function stripSwiftComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function swiftDeclarationBody(source, signaturePattern) {
  const text = stripSwiftComments(source);
  const match = text.match(signaturePattern);
  if (!match || match.index === undefined) {
    return "";
  }

  const start = text.indexOf("{", match.index + match[0].length);
  if (start < 0) {
    return "";
  }

  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start + 1, index);
      }
    }
  }

  return "";
}

function swiftFunctionBody(source, signaturePattern) {
  return swiftDeclarationBody(source, signaturePattern);
}

function allFiles(root) {
  const absoluteRoot = path.join(repoRoot, root);
  if (!fs.existsSync(absoluteRoot)) {
    return [];
  }

  const pending = [absoluteRoot];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(current)) {
        pending.push(path.join(current, child));
      }
    } else if (/\.(json|mjs|swift|ts)$/.test(current)) {
      files.push(path.relative(repoRoot, current));
    }
  }
  return files.sort();
}

function runtimeFiles() {
  return runtimeScanRoots.flatMap(allFiles);
}

function checkNoRuntimeAllowanceWording() {
  const offenders = [];
  for (const file of runtimeFiles()) {
    const text = read(file);
    if (/\ballow(?:ance|rance)\b|额度/i.test(text)) {
      offenders.push(file);
    }
  }

  if (offenders.length === 0) {
    pass("Usage terminology", "runtime/source contract uses usage, not allowance/额度");
  } else {
    fail("Usage terminology", offenders.join(", "));
  }
}

function checkV1ProvidersAndFixtures() {
  const fakeMeterOffenders = [];
  const providerOffenders = [];
  const internalMeterOffenders = [];

  for (const fixtureName of fixtureNames) {
    const snapshot = parseSnapshot(JSON.parse(read(path.join("fixtures", fixtureName))));
    const providerIds = snapshot.providers.map((provider) => provider.id).sort().join(",");
    if (providerIds !== "claude,codex") {
      providerOffenders.push(`${fixtureName}:${providerIds}`);
    }

    for (const provider of snapshot.providers) {
      if (provider.id !== "claude" && provider.id !== "codex") {
        providerOffenders.push(`${fixtureName}:${provider.id}`);
      }

      if (userFixtureNames.includes(fixtureName) && hasRenderableMeter(provider)) {
        fakeMeterOffenders.push(`${fixtureName}:${provider.id}`);
      }

      if (!internalFixtureNames.includes(fixtureName) && provider.usage.available) {
        internalMeterOffenders.push(`${fixtureName}:${provider.id}`);
      }
    }
  }

  if (providerOffenders.length === 0) {
    pass("V1 provider scope", "fixtures contain exactly Claude and Codex");
  } else {
    fail("V1 provider scope", providerOffenders.join(", "));
  }

  if (fakeMeterOffenders.length === 0 && internalMeterOffenders.length === 0) {
    pass("Fixture usage meters", "user-cacheable fixtures do not render fake percentages");
  } else {
    fail("Fixture usage meters", [...fakeMeterOffenders, ...internalMeterOffenders].join(", "));
  }
}

function hasRenderableMeter(provider) {
  return Boolean(
    provider.usage.available ||
      provider.capturedAt ||
      provider.usage.source ||
      provider.usage.sourceVersion ||
      (provider.usage.fiveHourRemainingPercent !== null && provider.usage.fiveHourRemainingPercent !== undefined) ||
      (provider.usage.weeklyRemainingPercent !== null && provider.usage.weeklyRemainingPercent !== undefined) ||
      provider.usage.fiveHourResetAt ||
      provider.usage.weeklyResetAt
  );
}

function checkWidgetHeaderCopy() {
  const expectedSimplifiedChinese = "别问了 还剩这么点 🤏";
  const expectedTraditionalChinese = "別問了 還剩這麼點 🤏";
  const expectedEnglish = "Fine, here's only this much 🤏";
  const expectedSpanish = "Vale, solo queda esto 🤏";
  const expectedPortuguese = "Tá, só sobrou isso 🤏";
  const expectedJapanese = "はいはい、残りはこれっぽっち🤏";
  const runtimeFiles = [
    "ios/AIUsageWidgetApp/ContentView.swift",
    "ios/AIUsageWidgetExtension/AIUsageWidget.swift",
    "mac/AIUsageConnector/Sources/AIUsageConnector/Support/AppText.swift",
  ];
  const previewFiles = ["scripts/render-widget-previews.mjs"];
  const missingSimplifiedChinese = [...runtimeFiles, ...previewFiles].filter((file) => !read(file).includes(expectedSimplifiedChinese));
  const missingTraditionalChinese = runtimeFiles.filter((file) => !read(file).includes(expectedTraditionalChinese));
  const missingEnglish = runtimeFiles.filter((file) => !read(file).includes(expectedEnglish));
  const missingSpanish = runtimeFiles.filter((file) => !read(file).includes(expectedSpanish));
  const missingPortuguese = runtimeFiles.filter((file) => !read(file).includes(expectedPortuguese));
  const missingJapanese = runtimeFiles.filter((file) => !read(file).includes(expectedJapanese));

  if (
    missingSimplifiedChinese.length === 0 &&
    missingTraditionalChinese.length === 0 &&
    missingEnglish.length === 0 &&
    missingSpanish.length === 0 &&
    missingPortuguese.length === 0 &&
    missingJapanese.length === 0
  ) {
    pass("Widget header copy", `${expectedSimplifiedChinese} / ${expectedTraditionalChinese} / ${expectedEnglish} / ${expectedSpanish} / ${expectedPortuguese} / ${expectedJapanese}`);
  } else {
    fail(
      "Widget header copy",
      [
        missingSimplifiedChinese.length ? `missing Simplified Chinese from ${missingSimplifiedChinese.join(", ")}` : "",
        missingTraditionalChinese.length ? `missing Traditional Chinese from ${missingTraditionalChinese.join(", ")}` : "",
        missingEnglish.length ? `missing English from ${missingEnglish.join(", ")}` : "",
        missingSpanish.length ? `missing Spanish from ${missingSpanish.join(", ")}` : "",
        missingPortuguese.length ? `missing Portuguese from ${missingPortuguese.join(", ")}` : "",
        missingJapanese.length ? `missing Japanese from ${missingJapanese.join(", ")}` : "",
      ].filter(Boolean).join("; ")
    );
  }
}

function checkUserFacingWifiCopy() {
  const appText = read("mac/AIUsageConnector/Sources/AIUsageConnector/Support/AppText.swift");
  const cacheStatusFormatter = read("ios/Shared/CacheStatusFormatter.swift");
  const expected = [
    "same Wi-Fi",
    "同一个 Wi-Fi",
    "同一個 Wi-Fi",
    "mismo Wi-Fi",
    "mesmo Wi-Fi",
    "同じWi-Fi",
  ];
  const rejected = [
    "same LAN",
    "同一个局域网",
    "同一個區域網路",
    "misma red para que no finja",
    "mesma rede, sem deixar",
    "同じLAN",
  ];
  const missing = expected.filter((snippet) => !appText.includes(snippet));
  const stale = rejected.filter((snippet) => appText.includes(snippet));
  if (!cacheStatusFormatter.includes('return "Wi-Fi"')) {
    missing.push('cache status return "Wi-Fi"');
  }
  [
    "Touched Mac · hot😏",
    "Touched Mac · warm",
    "not sure · need touching😏",
    "刚摸完，很润😏",
    "剛摸完，很潤😏",
    "Mac tocado · caliente😏",
    "Mac tocado · tibio",
    "Mac tocado · quente😏",
    "Mac tocado · morno",
    "なでたて、しっとり😏",
  ].forEach((snippet) => {
    if (!cacheStatusFormatter.includes(snippet)) {
      missing.push(`playful cache status ${snippet}`);
    }
  });
  [
    "Mac还热乎",
    "Mac還熱乎",
    "Macほかほか",
    "Mac still warm",
    "freshly touched",
    "Mac warm · touched",
    "Touched it, updated",
    "Mac calentito",
    "Mac tibio · tocado",
    "Mac quentinho",
    "Mac quente · tocado",
  ].forEach((snippet) => {
    if (cacheStatusFormatter.includes(snippet)) {
      stale.push(`stale cache status ${snippet}`);
    }
  });
  if (cacheStatusFormatter.includes('return "LAN"') || cacheStatusFormatter.includes('return "Widget LAN"')) {
    stale.push("compact cache status LAN label");
  }
  if (!cacheStatusFormatter.includes("if let source, isWiFiSource(source)") || !cacheStatusFormatter.includes("return wiFiFreshnessCaption")) {
    missing.push("paired Wi-Fi cache freshness formatter branch");
  }

  if (missing.length === 0 && stale.length === 0) {
    pass("User-facing Wi-Fi copy", "primary connector says Wi-Fi while compact app/widget status uses playful Mac freshness copy");
  } else {
    fail(
      "User-facing Wi-Fi copy",
      [
        missing.length ? `missing ${missing.join(", ")}` : "",
        stale.length ? `stale ${stale.join(", ")}` : "",
      ].filter(Boolean).join("; ")
    );
  }
}

function checkJapaneseLanguageSupport() {
  const files = [
    "ios/Shared/AppLanguageOption.swift",
    "mac/AIUsageConnector/Sources/AIUsageConnector/Support/AppText.swift",
    "mac/AIUsageConnector/README.md",
    "mac/AIUsageConnector/script/build_and_run.sh",
  ];
  const missing = files.filter((file) => !read(file).includes(file.endsWith("build_and_run.sh") ? "<string>ja</string>" : "日本語"));
  const missingResource = fs.existsSync(path.join(repoRoot, "mac/AIUsageConnector/Resources/ja.lproj/InfoPlist.strings"))
    ? []
    : ["mac/AIUsageConnector/Resources/ja.lproj/InfoPlist.strings"];

  if (missing.length === 0 && missingResource.length === 0) {
    pass("Japanese localization", "日本語 option and ja bundle localization are wired");
  } else {
    fail("Japanese localization", `missing Japanese support in ${[...missing, ...missingResource].join(", ")}`);
  }
}

function checkPortugueseLanguageSupport() {
  const files = [
    "ios/Shared/AppLanguageOption.swift",
    "mac/AIUsageConnector/Sources/AIUsageConnector/Support/AppText.swift",
    "mac/AIUsageConnector/README.md",
    "mac/AIUsageConnector/script/build_and_run.sh",
  ];
  const missing = files.filter((file) => !read(file).includes(file.endsWith("build_and_run.sh") ? "<string>pt-BR</string>" : "Português"));
  const resources = [
    "ios/AIUsageWidgetApp/pt-BR.lproj/InfoPlist.strings",
    "ios/AIUsageWidgetExtension/pt-BR.lproj/InfoPlist.strings",
    "mac/AIUsageConnector/Resources/pt-BR.lproj/InfoPlist.strings",
  ];
  const missingResource = resources.filter((resource) => !fs.existsSync(path.join(repoRoot, resource)));

  if (missing.length === 0 && missingResource.length === 0) {
    pass("Portuguese localization", "Português option and pt-BR bundle localization are wired");
  } else {
    fail("Portuguese localization", `missing Portuguese support in ${[...missing, ...missingResource].join(", ")}`);
  }
}

function checkPortugueseConnectorSettingsCopy() {
  const appText = read("mac/AIUsageConnector/Sources/AIUsageConnector/Support/AppText.swift");
  const mobileText = read("ios/AIUsageWidgetApp/ContentView.swift");
  const widgetText = read("ios/AIUsageWidgetExtension/AIUsageWidget.swift");
  const expectedConnector = [
    "portuguese: \"Idioma\"",
    "portuguese: \"Ajustes\"",
    "portuguese: \"Abrir ao iniciar\"",
    "portuguese: \"O serviço local alimenta o widget do iPhone. Não deixa ele passar fome.\"",
    "portuguese: \"Exibição\"",
    "portuguese: \"Ambos\"",
    "portuguese: \"Um ou ambos. Não culpe o app pela indecisão.\"",
    "portuguese: \"Mostrar QR\"",
    "portuguese: \"Abrir widget desktop\"",
    "portuguese: \"Porta / diagnóstico de rede\"",
    "portuguese: \"Serviço\"",
    "portuguese: \"Pareamento\"",
    "portuguese: \"Teste ao vivo\"",
    "portuguese: \"Pasta do projeto\"",
    "portuguese: \"Porta\"",
    "portuguese: \"Endereços\"",
    "portuguese: \"Rodando\"",
    "portuguese: \"Sim\"",
    "portuguese: \"Presente\"",
    "portuguese: \"Válido\"",
    "portuguese: \"Ativar assistente\"",
    "portuguese: \"Primeiro põe o assistente no lugar😏\"",
    "portuguese: \"Iniciar\"",
    "portuguese: \"Parar\"",
    "portuguese: \"Recarregar\"",
    "portuguese: \"Limite de privacidade\"",
    "portuguese: \"O status normal não mostra tokens",
  ];
  const expectedMobile = [
    "portuguese: \"Primeiro escaneia o QR do computador\"",
    "portuguese: \"Ajustes\"",
    "portuguese: \"Exibição\"",
    "portuguese: \"Estado do Mac\"",
    "portuguese: \"Desparear\"",
    "portuguese: \"Sem medidor😏\"",
    "portuguese: \"Registro velho, não confia demais🧊\"",
  ];
  const expectedWidget = [
    "portuguese: \"Sem cache😏\"",
    "portuguese: \"Sem medidor😏\"",
    "portuguese: \"O uso está se fazendo de mistério🙄\"",
  ];
  const missing = [
    ...expectedConnector.filter((snippet) => !appText.includes(snippet)),
    ...expectedMobile.filter((snippet) => !mobileText.includes(snippet)),
    ...expectedWidget.filter((snippet) => !widgetText.includes(snippet)),
  ];

  if (missing.length === 0) {
    pass("Portuguese runtime copy", "Mac settings, iPhone app, and widget fallback surfaces have Portuguese copy");
  } else {
    fail("Portuguese runtime copy", `missing ${missing.join(", ")}`);
  }
}

function checkMobileRefreshSurface() {
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const offenders = [];

  if (!app.includes("private var usageRefreshButton: some View")) {
    offenders.push("paired app dashboard must keep one designed in-card refresh button");
  }
  if (app.includes("ToolbarItem(placement: .topBarTrailing)")) {
    offenders.push("paired app dashboard must not duplicate refresh in the top-right toolbar");
  }
  if (!app.includes(".disabled(isRefreshingUsage)") || !app.includes("LinearGradient(")) {
    offenders.push("in-card refresh button must expose loading state and intentional styling");
  }

  if (offenders.length === 0) {
    pass("Mobile refresh surface", "paired app dashboard has one styled in-card refresh button and no top-right duplicate");
  } else {
    fail("Mobile refresh surface", offenders.join("; "));
  }
}

function checkMockingEmojiTone() {
  const softEmojiPattern = /🤷|🍵|🥲/u;
  const oldPointerPattern = /👉/u;
  const offenders = [];

  for (const file of runtimeFiles()) {
    const text = read(file);
    const issues = [];
    if (softEmojiPattern.test(text)) {
      issues.push("soft fallback emoji");
    }
    if (oldPointerPattern.test(text)) {
      issues.push("old pointer emoji");
    }
    if (issues.length > 0) {
      offenders.push(`${file}:${issues.join("+")}`);
    }
  }

  if (offenders.length === 0) {
    pass("Mocking emoji tone", "runtime copy avoids soft fallback emoji and old 👉 header drift");
  } else {
    fail("Mocking emoji tone", offenders.join(", "));
  }
}

function checkPreviewRendererInvariantGuard() {
  const renderer = read("scripts/render-widget-previews.mjs");
  const required = [
    "validateGeneratedPreviews(generated)",
    "fake percentage in safe preview",
    "allow(?:ance|rance)",
    "deferredProviderPattern",
  ];
  const missing = required.filter((needle) => !renderer.includes(needle));

  if (missing.length === 0) {
    pass("Preview SVG guard", "generated previews enforce header/provider/no-fake-meter invariants");
  } else {
    fail("Preview SVG guard", `missing ${missing.join(", ")}`);
  }
}

function checkNoCacheHeaderCopy() {
    const widget = read("ios/AIUsageWidgetExtension/AIUsageWidget.swift");
    const generatedNoCachePath = path.join(repoRoot, "outputs/widget-previews/no_cache_fallback.svg");
    const generatedNoCache = fs.existsSync(generatedNoCachePath) ? fs.readFileSync(generatedNoCachePath, "utf8") : "";
    const offenders = [];

    if (!widget.includes("entry.cacheSource == \"preview\" ? text.preview : text.noCache") || !widget.includes('simplified: "没缓存😏"')) {
        offenders.push("Swift widget no-cache header");
    }
    if (!generatedNoCache.includes("别问了 还剩这么点 🤏") || !generatedNoCache.includes("无表可看😏")) {
        offenders.push("SVG preview no-cache fallback");
    }

    if (offenders.length === 0) {
        pass("No-cache header copy", "real no-cache state keeps mocking fallback while header stays fixed");
    } else {
        fail("No-cache header copy", offenders.join(", "));
    }
}

function checkNoGlobalOfflineDimming() {
  const swiftWidget = read("ios/AIUsageWidgetExtension/AIUsageWidget.swift");
  const svgRenderer = read("scripts/render-widget-previews.mjs");
  const generatedOfflinePath = path.join(repoRoot, "outputs/widget-previews/offline.svg");
  const generatedOffline = fs.existsSync(generatedOfflinePath) ? read("outputs/widget-previews/offline.svg") : "";
  const offenders = [];

  if (/\.opacity\([^)]*snapshot\.device\.online/i.test(swiftWidget)) {
    offenders.push("ios/AIUsageWidgetExtension/AIUsageWidget.swift");
  }
  if (/opacity=.*snapshot\.device\.online/i.test(svgRenderer) || /<g opacity=/.test(generatedOffline)) {
    offenders.push("scripts/render-widget-previews.mjs / outputs/widget-previews/offline.svg");
  }

  if (offenders.length === 0) {
    pass("Offline contrast", "offline state does not globally dim widget content");
  } else {
    fail("Offline contrast", offenders.join(", "));
  }
}

function checkAppGroupRuntimeFallbackVisibility() {
  const snapshotStore = read("ios/Shared/SnapshotStore.swift");
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const offenders = [];

  if (!snapshotStore.includes("guard !resolved.source.usesFallback else") ||
      !snapshotStore.includes("return nil")) {
    offenders.push("AppGroup.defaults must fail closed when runtime plist value falls back");
  }
  if (!snapshotStore.includes("fallbackUnexpandedInfoPlist") ||
      !snapshotStore.includes("fallbackInvalidInfoPlist") ||
      !snapshotStore.includes("statusDetailText")) {
    offenders.push("AppGroup must expose why fallback was used");
  }
  const appGroupSection =
    app.match(/Section\("M0 App Group"\)[\s\S]*?Button\("写入测试字符串"\)/)?.[0] ??
    app.match(/proofCaption\("Proof 01 · App Group"\)[\s\S]*?Button\("写入测试字符串"\)/)?.[0] ??
    "";
  if (!appGroupSection.includes("AppGroup.statusDetailText") ||
      !appGroupSection.includes("AppGroup.identifierSource.usesFallback")) {
    offenders.push("M0 App Group section must show runtime identifier source and fallback warning");
  }

  if (offenders.length === 0) {
    pass("App Group fallback visibility", "runtime fallback is unavailable and visible in M0 proof UI");
  } else {
    fail("App Group fallback visibility", offenders.join(", "));
  }
}

function checkNoApprovalMessageInput() {
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const section =
    app.match(/Section\("快速批准"\)[\s\S]*?Section\("M0 App Group"\)/)?.[0] ??
    app.match(/private\s+var\s+debugApprovalSection\s*:\s*some\s+View\s*\{[\s\S]*?private\s+var\s+debugAppGroupSection\s*:\s*some\s+View\s*\{/)?.[0] ??
    "";
  const appApprovalHelpers = [
    "approvalDecisionButtons",
    "approveButton",
    "denyButton",
    "approvalControlGroup",
    "refreshApprovalButton",
    "seedApprovalButton",
    "clearApprovalButton",
  ].map((name) => ({
    name,
    body: swiftDeclarationBody(app, new RegExp(`private\\s+var\\s+${name}\\s*:\\s*some\\s+View\\b`)),
  }));
  const appApprovalSurface = [section, ...appApprovalHelpers.map((helper) => helper.body)].join("\n");
  const offenders = [];

  if (!section) {
    offenders.push("missing 快速批准 section");
  }
  const missingApprovalHelpers = appApprovalHelpers
    .filter((helper) => !helper.body)
    .map((helper) => helper.name);
  if (missingApprovalHelpers.length > 0) {
    offenders.push(`approval helper views missing from guard: ${missingApprovalHelpers.join(", ")}`);
  }
  if (/\b(?:TextField|TextEditor|SecureField)\s*\(/.test(appApprovalSurface)) {
    offenders.push("approval section contains text input");
  }

  const widget = read("ios/AIUsageWidgetExtension/AIUsageWidget.swift");
  const intentBody = swiftDeclarationBody(widget, /struct\s+ApprovalDecisionIntent\s*:\s*AppIntent\b/);
  const approvalActionsBody = swiftDeclarationBody(widget, /private\s+struct\s+ApprovalHeaderActions\s*:\s*View\b/);
  const widgetPerformBody = swiftFunctionBody(intentBody, /func\s+perform\s*\(\)\s+async\s+throws\s*->\s*some\s+IntentResult\b/);
  const appDecisionBody = swiftFunctionBody(app, /private\s+func\s+decideApproval\s*\(\s*_\s+action\s*:\s*ApprovalDecision\.Action\s*\)\s+async\b/);
  const approvalButtons = [...approvalActionsBody.matchAll(/Button\s*\(\s*intent:\s*ApprovalDecisionIntent/g)];
  const approvalButtonActions = [...approvalActionsBody.matchAll(/Button\s*\(\s*intent:\s*ApprovalDecisionIntent\s*\([\s\S]*?action:\s*\.(approve|deny)[\s\S]*?\)\s*\)/g)]
    .map((match) => match[1])
    .sort();
  const intentParameters = [...intentBody.matchAll(/@Parameter\s*\([^)]*\)\s*var\s+([A-Za-z][A-Za-z0-9_]*)/g)]
    .map((match) => match[1])
    .sort();
  if (!intentBody) {
    offenders.push("missing widget ApprovalDecisionIntent AppIntent");
  }
  if (!approvalActionsBody) {
    offenders.push("missing widget ApprovalHeaderActions body");
  }
  if (!approvalActionsBody.includes("Mac待批🙃") ||
      !approvalActionsBody.includes("本地测😏") ||
      !approvalActionsBody.includes("request.isLocalUIFixture")) {
    offenders.push("widget approval header must distinguish Mac-owned requests from local UI fixtures");
  }
  if (!/static\s+var\s+openAppWhenRun\s*=\s*false/.test(intentBody)) {
    offenders.push("widget approval intent must not open the app to complete approve/deny");
  }
  if (intentParameters.join(",") !== "actionRawValue,requestId") {
    offenders.push(`widget approval intent parameters must stay requestId/action only: ${intentParameters.join(",") || "none"}`);
  }
  if (/\b(?:message|comment|prompt|freeform|textInput|text)\b/i.test(intentBody)) {
    offenders.push("widget approval intent must not add message/comment/prompt input");
  }
  if (approvalButtons.length !== 2 || approvalButtonActions.join(",") !== "approve,deny") {
    offenders.push(`widget approval buttons must be exactly approve+deny: ${approvalButtonActions.join(",") || "none"}`);
  }
  if (!approvalActionsBody.includes("Button(intent: ApprovalDecisionIntent")) {
    offenders.push("widget approval intent should be button-only with no message parameter");
  }
  if (!widgetPerformBody) {
    offenders.push("missing widget ApprovalDecisionIntent.perform body");
  } else if (!widgetPerformBody.includes("ApprovalDecisionHandler(") || !/\.decide\s*\(/.test(widgetPerformBody)) {
    offenders.push("widget approval intent must use the shared decision handler");
  }
  if (/submitApprovalDecisionWithReport\s*\(|recordDecision\s*\(/.test(widgetPerformBody)) {
    offenders.push("widget approval path must not duplicate Mac/local receipt logic outside the shared handler");
  }
  if (!widget.includes("WidgetRefreshCoordinator") || widget.includes("source.snapshotWithReport")) {
    offenders.push("widget LAN refresh must go through the shared refresh coordinator");
  }

  const approvalStore = read("ios/Shared/ApprovalStore.swift");
  const approvalHandler = read("ios/Shared/ApprovalDecisionHandler.swift");
  const refreshCoordinator = read("ios/Shared/WidgetRefreshCoordinator.swift");
  if (!approvalStore.includes("isLocalUIFixture") ||
      !approvalStore.includes("local-fixture-") ||
      !approvalStore.includes("requiresLocalFixture")) {
    offenders.push("approval store must distinguish local UI fixture decisions from Mac-owned requests");
  }
  if (!app.includes("Button(\"本地 UI 测试请求\"")) {
    offenders.push("local approval fixture button must be visibly local UI-only before tapping");
  }
  if (!app.includes("Button(\"清掉本地测试\"")) {
    offenders.push("local approval fixture clear button must be visibly local-only");
  }
  if (!app.includes("本地测试，别拿去验收😏")) {
    offenders.push("local approval fixture status must warn it is not acceptance proof");
  }
  if (!approvalHandler.includes("pendingRequest.isLocalUIFixture")) {
    offenders.push("app/widget must not clear Mac-owned approvals through the local fixture path");
  }
  if (!appDecisionBody) {
    offenders.push("missing app decideApproval body");
  } else if (!appDecisionBody.includes("ApprovalDecisionHandler(") || !/\.decide\s*\(/.test(appDecisionBody)) {
    offenders.push("app approval buttons must use the shared decision handler");
  }
  if (/submitApprovalDecisionWithReport\s*\(|recordDecision\s*\(/.test(appDecisionBody)) {
    offenders.push("app approval path must not duplicate Mac/local receipt logic outside the shared handler");
  }
  const submitIndex = approvalHandler.indexOf("try await submitDecision(decision, pairedDevice)");
  const recordIndex = approvalHandler.indexOf("let recorded = try recordDecision(requestId, action, decidedAt, false)");
  if (submitIndex < 0 || recordIndex < 0 || submitIndex > recordIndex) {
    offenders.push("Mac-owned widget approvals must submit to the paired Mac before local recording");
  }
  if (refreshCoordinator.includes("clearPendingRequest")) {
    offenders.push("widget approval refresh must not clear Mac-owned pending requests from request:null");
  }
  const widgetApprovalSyncMatch = /await\s+syncApprovalRequest\s*\(\s*from:\s*pairedDevice\s*,\s*budget:/m.exec(refreshCoordinator);
  const widgetApprovalSyncIndex = widgetApprovalSyncMatch?.index ?? -1;
  const widgetSnapshotIndex = refreshCoordinator.indexOf("try await snapshotWithReport(pairedDevice)");
  if (widgetApprovalSyncIndex < 0 || widgetSnapshotIndex < 0 || widgetApprovalSyncIndex > widgetSnapshotIndex) {
    offenders.push("widget approval refresh must run independently before usage snapshot fetch");
  }
  const appApprovalRefresh = app.match(/private func refreshApprovalFromMac\(payload[\s\S]*?@MainActor\s+private func decideApproval/)?.[0] ?? "";
  if (appApprovalRefresh.includes("clearPendingRequest")) {
    offenders.push("app Mac approval refresh must preserve pending requests when Mac returns request:null");
  }
  const appClearFixture = app.match(/private func clearApprovalFixture[\s\S]*?private func previewUsageCaption/)?.[0] ?? "";
  if (!appClearFixture.includes("pending.isLocalUIFixture")) {
    offenders.push("app clear-test-request action must only clear local UI fixtures");
  }

  if (offenders.length === 0) {
    pass("Approval input surface", "widget/app approve-deny stays exact, in-place, message-free, and Mac-owned requests require Mac receipt");
  } else {
    fail("Approval input surface", offenders.join(", "));
  }
}

function checkDeviceProofCaptions() {
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const helper = read("ios/Shared/WidgetTapProof.swift");
  const validator = read("ios/Tools/ValidateFixtures.swift");
  const appRequiredFragments = [
    "Proof 01 · App Group",
    "Proof 02/03/07 · 配对、LAN 缓存、Widget 回 App",
    "Proof 04 · Widget LAN",
    "Proof 05/06 · 离线/最终 Widget",
    "Proof 08/09/11/12 · Mac 请求，不是本地测试",
    "widgetOpenProofText",
    "WidgetRefreshDeepLink.isRefreshURL(url)",
    "WidgetTapProofText.initial",
    "WidgetTapProofText.openedWithoutPairing()",
    "WidgetTapProofText.openedRefreshing()",
    "LocalNetworkPermissionHint.text(for: failure.report)",
  ];
  const helperRequiredFragments = [
    "Proof 07 · 还没从 Widget 打开",
    "Proof 10 · 第一次 LAN 失败时",
    "allSatisfy",
  ];
  const validatorRequiredFragments = [
    "try validateWidgetTapProof()",
    "validated widget tap proof helpers",
  ];
  const missing = [
    ...appRequiredFragments.filter((fragment) => !app.includes(fragment)).map((fragment) => `app:${fragment}`),
    ...helperRequiredFragments.filter((fragment) => !helper.includes(fragment)).map((fragment) => `helper:${fragment}`),
    ...validatorRequiredFragments.filter((fragment) => !validator.includes(fragment)).map((fragment) => `validator:${fragment}`),
  ];

  if (missing.length === 0) {
    pass("Device proof captions", "app exposes compact proof labels for App Group, LAN, widget tap, approval, and Local Network diagnostics");
  } else {
    fail("Device proof captions", missing.join(", "));
  }
}

function checkApprovalRequestNullSemantics() {
  const contract = read("CONTRACT.md");
  const docs = [
    "CONTRACT.md",
    "README.md",
    "ios/README.md",
    "outputs/AI-Usage-Widget-Implementation-Status.md",
  ];
  const staleDocs = docs.filter((file) => {
    const text = read(file);
    return /request:null[\s\S]{0,180}(?:clears?|清除|清掉)/i.test(text) &&
      !/request:null[\s\S]{0,180}(?:does not clear|must not clear|not as permission to clear|不能|不清)/i.test(text);
  });
  const hasRequiredContract = /request:null[\s\S]{0,240}must not clear a local Mac-owned pending request/i.test(contract);

  if (staleDocs.length === 0 && hasRequiredContract) {
    pass("Approval request:null semantics", "Mac-owned pending requests clear only through decision receipt");
  } else {
    fail(
      "Approval request:null semantics",
      [
        ...staleDocs,
        ...(hasRequiredContract ? [] : ["CONTRACT.md missing must-not-clear rule"]),
      ].join(", ")
    );
  }
}

function checkApprovalReceiptBinding() {
  const localHTTP = read("ios/Shared/LocalHTTPSource.swift");
  const swiftTests = read("ios/AIUsageWidgetTests/AIUsageWidgetTests.swift");
  const validator = read("ios/Tools/ValidateFixtures.swift");
  const smoke = read("scripts/smoke-local-approval.mjs");
  const approvalStore = read("connector/src/approval.ts");
  const connectorServer = read("connector/src/server.ts");
  const serverTests = read("connector/test/server.test.ts");
  const offenders = [];

  if (!localHTTP.includes("response.requestId == decision.requestId") ||
      !localHTTP.includes("response.action == decision.action")) {
    offenders.push("approval POST response must match submitted requestId/action before local clear");
  }
  if (!swiftTests.includes("testApprovalDecisionRejectsMismatchedMacReceipt") ||
      !swiftTests.includes("wrong-request")) {
    offenders.push("XCTest must cover mismatched approval receipt rejection");
  }
  if (!validator.includes("wrong-request") ||
      !validator.includes("failure.message == \"Mac 没收这票\"")) {
    offenders.push("Swift validator must cover mismatched approval receipt rejection");
  }
  if (!smoke.includes("submittedDecision") ||
      !smoke.includes("decoded.requestId == submittedRequestId") ||
      !smoke.includes("decoded.action.rawValue == submittedAction")) {
    offenders.push("local approval smoke must compare Mac receipt to submitted decision");
  }
  if (!approvalStore.includes("findStoredApprovalDecision") ||
      !connectorServer.includes("existingDecision") ||
      !connectorServer.includes("findStoredApprovalDecision(input)")) {
    offenders.push("connector approval POST must return a stored matching receipt for idempotent retries");
  }
  if (!serverTests.includes("matching approval decision retry returns stored receipt") ||
      !serverTests.includes("loadStoredApprovalDecisions(paths).length, 1")) {
    offenders.push("connector tests must cover idempotent approval retry without duplicate stored decisions");
  }

  if (offenders.length === 0) {
    pass("Approval receipt binding", "Mac-owned approvals clear only after matching request/action receipt and retry safely");
  } else {
    fail("Approval receipt binding", offenders.join(", "));
  }
}

function checkLANPairedDeviceBinding() {
  const localHTTP = read("ios/Shared/LocalHTTPSource.swift");
  const swiftTests = read("ios/AIUsageWidgetTests/AIUsageWidgetTests.swift");
  const validator = read("ios/Tools/ValidateFixtures.swift");
  const offenders = [];

  if (!localHTTP.includes("response.deviceId == payload.deviceId") ||
      !localHTTP.includes("snapshot.device.id == payload.deviceId") ||
      !localHTTP.includes("pairedDeviceMismatch")) {
    offenders.push("iOS LAN ping and snapshot reads must verify the paired Mac deviceId");
  }
  if (!swiftTests.includes("testPingRejectsMismatchedPairedMacIdentity") ||
      !swiftTests.includes("testSnapshotRejectsMismatchedPairedMacIdentity")) {
    offenders.push("XCTest must reject mismatched paired-Mac ping and snapshot identities");
  }
  if (!validator.includes("rejected mismatched Mac identity") ||
      !validator.includes("localHTTPMismatchedDeviceWasAccepted")) {
    offenders.push("Swift validator must execute mismatched paired-Mac identity rejection");
  }

  if (offenders.length === 0) {
    pass("LAN identity binding", "iOS accepts LAN ping/snapshot only from the paired Mac device id");
  } else {
    fail("LAN identity binding", offenders.join(", "));
  }
}

function checkApprovalDiagnosticPrivacy() {
  const approvalStore = read("ios/Shared/ApprovalStore.swift");
  const widget = read("ios/AIUsageWidgetExtension/AIUsageWidget.swift");
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const diagnosticBlock = approvalStore.match(/struct ApprovalAttemptDiagnostic[\s\S]*?enum ApprovalStoreError/)?.[0] ?? "";
  const offenders = [];

  if (!diagnosticBlock) {
    offenders.push("missing ApprovalAttemptDiagnostic");
  }
  if (!approvalStore.includes("approvalAttemptDiagnosticKey")) {
    offenders.push("missing App Group diagnostic key");
  }
  if (!diagnosticBlock.includes("validateDiagnosticDetail")) {
    offenders.push("diagnostic detail must be validated separately from request text");
  }
  if (diagnosticBlock.includes("LocalHTTPReport")) {
    offenders.push("approval diagnostics must not persist full LocalHTTPReport");
  }

  const storedFieldNames = [...diagnosticBlock.matchAll(/\blet\s+([A-Za-z][A-Za-z0-9_]*)\s*:/g)]
    .map((match) => match[1])
    .filter((name) => name !== "attemptedHostCount");
  const forbiddenFields = storedFieldNames.filter((name) =>
    /^(?:host|hosts|url|urls|token|tokens|message|comment|prompt|reason|body|responseBody|rawOutput)$/i.test(name)
  );
  if (forbiddenFields.length > 0) {
    offenders.push(`diagnostic stores forbidden fields: ${forbiddenFields.join(", ")}`);
  }

  if (!widget.includes("saveApprovalAttemptDiagnostic(.success") ||
      !widget.includes("saveApprovalAttemptDiagnostic(.failure") ||
      !widget.includes("saveApprovalAttemptDiagnostic(.invalidAction")) {
    offenders.push("widget AppIntent must persist bounded success/failure diagnostics before swallowing outcomes");
  }
  if (!app.includes("saveApprovalAttemptDiagnostic(.success") ||
      !app.includes("saveApprovalAttemptDiagnostic(.failure") ||
      !app.includes("origin: .app")) {
    offenders.push("app approval path must persist bounded success/failure diagnostics");
  }
  if (!app.includes("loadLastAttemptDiagnostic") || !app.includes("approvalAttemptCaption")) {
    offenders.push("app must surface the last approval-attempt diagnostic for device QA");
  }

  if (offenders.length === 0) {
    pass("Approval diagnostics privacy", "last attempt diagnostics are local, bounded, and token/body/URL-free");
  } else {
    fail("Approval diagnostics privacy", offenders.join(", "));
  }
}

function checkWidgetLANDiagnosticPrivacy() {
  const snapshotStore = read("ios/Shared/SnapshotStore.swift");
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const block = snapshotStore.match(/private enum WidgetDiagnosticSafety[\s\S]*?enum SnapshotStoreError/)?.[0] ?? "";
  const offenders = [];

  if (!block) {
    offenders.push("missing WidgetLANDiagnostic");
  }
  if (!block.includes("struct WidgetApprovalSyncDiagnostic")) {
    offenders.push("missing widget approval-sync diagnostic");
  }
  if (!block.includes("let approvalSync: WidgetApprovalSyncDiagnostic?")) {
    offenders.push("Widget LAN diagnostic must carry bounded approval-sync outcome");
  }
  const storedFieldNames = [...block.matchAll(/\blet\s+([A-Za-z][A-Za-z0-9_]*)\s*:/g)]
    .map((match) => match[1])
    .filter((name) => name !== "attemptedHostCount");
  const forbiddenFields = storedFieldNames.filter((name) =>
    /^(?:host|hosts|winningHost|url|urls|token|tokens|report|body|responseBody|rawOutput)$/i.test(name)
  );
  if (forbiddenFields.length > 0) {
    offenders.push(`widget LAN diagnostic stores forbidden fields: ${forbiddenFields.join(", ")}`);
  }
  if (/\blet\s+report\s*:/.test(block)) {
    offenders.push("widget LAN diagnostic must not persist full LocalHTTPReport");
  }
  if (!/localhost\|[\s\S]*\\\.\[a-z0-9\]/.test(block)) {
    offenders.push("widget LAN diagnostic detail sanitizer must reject local/domain hostnames");
  }
  const refreshBlock = app.match(/private func refreshWidgetLANDiagnostic[\s\S]*?private func refreshApprovalState/)?.[0] ?? "";
  if (refreshBlock.includes("describe(report:")) {
    offenders.push("app Widget LAN diagnostic display must not render persisted hostnames");
  }
  if (!app.includes("widgetApprovalSyncMetadata(")) {
    offenders.push("app must display widget approval-sync diagnostics for device QA");
  }

  if (offenders.length === 0) {
    pass("Widget LAN diagnostics privacy", "persisted widget LAN diagnostics and approval sync are host/URL/body-free");
  } else {
    fail("Widget LAN diagnostics privacy", offenders.join(", "));
  }
}

function checkAppLANDiagnosticDisplayPrivacy() {
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const formatter = read("ios/Shared/LocalHTTPReportFormatter.swift");
  const localHTTP = read("ios/Shared/LocalHTTPSource.swift");
  const swiftTests = read("ios/AIUsageWidgetTests/AIUsageWidgetTests.swift");
  const validator = read("ios/Tools/ValidateFixtures.swift");
  const offenders = [];

  if (!app.includes("LocalHTTPReportFormatter.diagnosticText(report:")) {
    offenders.push("app connection details must use the shared LAN report formatter");
  }
  if (/attempt\.host|report\.winningHost\s*\?\?|describe\(report:/.test(app)) {
    offenders.push("app connection details must not render raw LAN host values");
  }
  if (!localHTTP.includes("PrivacySafeText.isSafeDisplayText(response.name") ||
      !swiftTests.includes("testPingRejectsUnsafeMacName") ||
      !validator.includes("rejected unsafe ping name")) {
    offenders.push("ping response names must be privacy-validated before app display");
  }
  if (/successStatus:\s*\{\s*"[^"]*\\\(\$0\)/.test(app)) {
    offenders.push("app connection status must not interpolate the Mac ping name into screenshots");
  }
  const formatterRequirements = [
    "地址 \\(index + 1)",
    "containsUnsafeNetworkText",
    "https://",
    "authorization",
    "bearer",
    "\\d{1,3}",
    "localhost",
    "诊断已脱敏",
  ];
  const missingFormatterRequirements = formatterRequirements.filter((needle) => !formatter.includes(needle));
  if (missingFormatterRequirements.length > 0) {
    offenders.push(`LAN report formatter missing privacy guard text: ${missingFormatterRequirements.join(", ")}`);
  }

  if (offenders.length === 0) {
    pass("App LAN display privacy", "app-side connection details use address indexes and sanitize unsafe messages");
  } else {
    fail("App LAN display privacy", offenders.join(", "));
  }
}

function checkPairingDisplayPrivacy() {
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const pairing = read("ios/Shared/PairingPayload.swift");
  const swiftTests = read("ios/AIUsageWidgetTests/AIUsageWidgetTests.swift");
  const validator = read("ios/Tools/ValidateFixtures.swift");
  const offenders = [];

  if (!app.includes("displaySummary") || app.includes("displayEndpoint")) {
    offenders.push("app saved-pairing row must use the safe display summary, not a raw endpoint");
  }
  if (app.includes("pairedDevice.name") || app.includes("savedPayload.name") || app.includes("\\($0.name)")) {
    offenders.push("app saved-pairing UI and status must not render local Mac names in proof screenshots");
  }
  if (!pairing.includes("PrivacySafeText.isSafeDisplayText(payload.name") ||
      !swiftTests.includes("testPairingNameCannotExposeHostsOrSecrets") ||
      !validator.includes("rejected unsafe pairing names")) {
    offenders.push("pairing Mac names must reject host/token/URL-like text");
  }
  if (!swiftTests.includes("localizedDescription.contains(\"authorization\")") ||
      !validator.includes("unknownPairingFieldLeakedText")) {
    offenders.push("unknown pairing field errors must not echo unsafe field names into UI");
  }
  const displaySummaryBody = swiftDeclarationBody(pairing, /var\s+displaySummary\s*:\s*String\b/);
  if (!displaySummaryBody) {
    offenders.push("PairingPayload must expose a displaySummary");
  } else {
    if (/hosts\.first|firstHost|host\s*\)/.test(displaySummaryBody)) {
      offenders.push("displaySummary must not render raw host values");
    }
    if (!displaySummaryBody.includes("hosts.count") || !displaySummaryBody.includes("端口 \\(port)")) {
      offenders.push("displaySummary should show host count and port only");
    }
  }
  if (!swiftTests.includes("testPairingDisplaySummaryDoesNotExposeRawHosts") ||
      !validator.includes("validated pairing display summary privacy")) {
    offenders.push("Swift tests/validator must cover pairing display privacy");
  }

  if (offenders.length === 0) {
    pass("Pairing display privacy", "saved-pairing UI shows host count and port without raw hosts or tokens");
  } else {
    fail("Pairing display privacy", offenders.join(", "));
  }
}

function checkWidgetRefreshTotalBudget() {
  const refreshCoordinator = read("ios/Shared/WidgetRefreshCoordinator.swift");
  const validator = read("ios/Tools/ValidateFixtures.swift");
  const offenders = [];

  const requiredCoordinatorText = [
    "refreshBudget: 3.5",
    "approvalSyncBudget: 0.75",
    "remainingBudget(startedAt:",
    "runWithTimeout(seconds:",
    "WidgetRefreshCoordinatorError.timedOut",
    "syncApprovalRequest(",
    "budget: min(approvalSyncBudget",
    "async -> WidgetApprovalSyncDiagnostic",
    "approvalSync: approvalSync",
    "return .timedOut()",
  ];
  const missingCoordinatorText = requiredCoordinatorText.filter((needle) => !refreshCoordinator.includes(needle));
  if (missingCoordinatorText.length > 0) {
    offenders.push(`coordinator missing budget guard text: ${missingCoordinatorText.join(", ")}`);
  }
  if (/await\s+syncApprovalRequest\s*\(\s*from:\s*pairedDevice\s*\)\s*[\s\S]{0,240}try await snapshotWithReport\(pairedDevice\)/m.test(refreshCoordinator)) {
    offenders.push("widget approval sync must not run unbudgeted before snapshot fetch");
  }
  if (!validator.includes("slowApprovalCoordinator") ||
      !validator.includes("approvalSyncBudget: 0.05") ||
      !validator.includes("slowApprovalSavedSnapshot == PreviewSnapshots.normal") ||
      !validator.includes("slowApprovalSavedRequest == nil") ||
      !validator.includes("approvalSync?.outcome == .timedOut") ||
      !validator.includes("approvalSync?.outcome == .noRequest")) {
    offenders.push("Swift validator must prove slow approval sync cannot starve snapshot refresh");
  }

  if (offenders.length === 0) {
    pass("Widget refresh budget", "approval sync and snapshot fetch share a bounded WidgetKit refresh budget");
  } else {
    fail("Widget refresh budget", offenders.join(", "));
  }
}

function checkWidgetUsesPairingHostCap() {
  const widget = read("ios/AIUsageWidgetExtension/AIUsageWidget.swift");
  const approvalHandler = read("ios/Shared/ApprovalDecisionHandler.swift");
  const refreshCoordinator = read("ios/Shared/WidgetRefreshCoordinator.swift");
  const combinedSource = `${widget}\n${approvalHandler}\n${refreshCoordinator}`;
  const hardcodedCaps = combinedSource.match(/maxHostAttempts:\s*\d+/g) ?? [];
  const expectedReferences = (combinedSource.match(/maxHostAttempts:\s*PairedDeviceStore\.maxHosts/g) ?? []).length;

  if (hardcodedCaps.length === 0 && expectedReferences >= 2) {
    pass("Widget host attempts", "widget LAN refresh and approval intent use the pairing schema host cap");
  } else {
    fail("Widget host attempts", hardcodedCaps.length > 0 ? hardcodedCaps.join(", ") : "missing PairedDeviceStore.maxHosts references");
  }
}

function checkContractUnavailableUsageShape() {
  const docPaths = [
    "CONTRACT.md",
    "outputs/AI-Usage-Widget-Implementation-Plan-v4.md",
  ];
  const staleFields = [
    "capturedAt",
    "source",
    "sourceVersion",
    "fiveHourRemainingPercent",
    "fiveHourResetAt",
    "weeklyRemainingPercent",
    "weeklyResetAt",
  ].join("|");
  const staleExamples = docPaths.flatMap((docPath) => {
    const matches = read(docPath).match(new RegExp(`"available": false[\\s\\S]{0,300}"(?:${staleFields})"`, "g")) ?? [];
    return matches.map(() => docPath);
  });

  if (staleExamples.length === 0) {
    pass("Contract unavailable usage", "contract/plan docs show minimal available=false plus reason shape");
  } else {
    fail("Contract unavailable usage", [...new Set(staleExamples)].join(", "));
  }
}

function checkRuntimeProviderSurface() {
  const files = [
    "ios/AIUsageWidgetExtension/AIUsageWidget.swift",
    "ios/AIUsageWidgetApp/ContentView.swift",
    "src/contract/schema.ts",
    "scripts/render-widget-previews.mjs",
  ];
  const futureProviderRe = /\b(?:openclaw|hermes)\b/i;
  const offenders = files.filter((file) => futureProviderRe.test(read(file)));

  if (offenders.length === 0) {
    pass("Deferred provider UI", "Hermes/OpenClaw are absent from V1 widget/app provider surface");
  } else {
    fail("Deferred provider UI", offenders.join(", "));
  }
}

function checkWidgetFamilySurface() {
  const widget = read("ios/AIUsageWidgetExtension/AIUsageWidget.swift");
  const app = read("ios/AIUsageWidgetApp/ContentView.swift");
  const store = read("ios/Shared/SnapshotStore.swift");
  const manifest = JSON.parse(read("outputs/device-evidence/manifest.json"));
  const offenders = [];

  if (!widget.includes(".supportedFamilies([.systemSmall, .systemMedium])")) {
    offenders.push("WidgetKit configuration must support small single-provider and medium two-provider families");
  }
  const unsupportedFamilies = [".systemLarge", ".systemExtraLarge", ".accessoryRectangular", ".accessoryInline", ".accessoryCircular"]
    .filter((family) => widget.includes(family));
  if (unsupportedFamilies.length > 0) {
    offenders.push(`unsupported WidgetKit family present: ${unsupportedFamilies.join(", ")}`);
  }
  const finalWidgetProof = manifest.requiredScreenshots?.find((item) => item.filename === "06-final-widget.png");
  if (!finalWidgetProof?.expectedEvidence?.includes("Medium widget") || !finalWidgetProof?.expectedEvidence?.includes("small widget")) {
    offenders.push("device screenshot manifest must cover both medium two-column and small single-provider widget proof");
  }
  if (!store.includes('static let usageProviderModeKey = "usageProviderMode"') ||
      !app.includes("@AppStorage(AppGroup.usageProviderModeKey, store: AppGroup.defaults)") ||
      !widget.includes("store.loadUsageProviderModeRaw()") ||
      !widget.includes("if savedSelection != .both")) {
    offenders.push("small widget provider choice must follow the app display setting through App Group");
  }
  if (!widget.includes("showsInlineRefreshButton: true") ||
      !widget.includes("providerTitleAction: .switchProvider") ||
      !widget.includes("struct ToggleWidgetProviderIntent") ||
      !widget.includes("SnapshotStore().saveUsageProviderModeRaw(nextProvider.rawValue)") ||
      !widget.includes("if showsInlineRefreshButton") ||
      !widget.includes("Text(text.compactHeader)") ||
      !widget.includes("Only this much") ||
      !widget.includes("还剩这么点") ||
      !widget.includes("Solo queda esto") ||
      !widget.includes("Só sobrou isso") ||
      !widget.includes("残りはこれっぽっち")) {
    offenders.push("small widget must use compact localized header text, provider-level refresh, and provider-name toggle");
  }
  if (!widget.includes(".padding(.leading, 20)") ||
      !widget.includes(".padding(.trailing, 12)") ||
      !widget.includes(".padding(.top, 20)") ||
      !widget.includes(".padding(.bottom, 9)")) {
    offenders.push("small widget must keep enough top-left breathing room without squeezing localized header text");
  }
  if (!widget.includes("let providerStatusLine: String? = providers.count == 1 ? headerStatus : nil") ||
      !widget.includes("let providerStatusLine: String?") ||
      !widget.includes("providerStatusLine: providerStatusLine") ||
      !widget.includes("if let providerStatusLine") ||
      !widget.includes("Text(providerStatusLine)") ||
      !widget.includes("design: .monospaced") ||
      !widget.includes(".layoutPriority(1)") ||
      !widget.includes("let isDualMode = providers.count > 1") ||
      !widget.includes("return VStack(alignment: .leading, spacing: isDualMode ? 5 : 8)") ||
      !widget.includes("isCompact: isDualMode") ||
      !widget.includes(".padding(.top, isDualMode ? 10 : 15)") ||
      !widget.includes(".padding(.bottom, isDualMode ? 12 : 8)") ||
      widget.includes("WidgetHeaderStatusText(status: headerStatus)")) {
    offenders.push("medium widget must reserve dual-mode space for header/refresh while keeping provider status copy only for single-provider mode");
  }
  if (!store.includes('static let widgetProviderOrderKey = "aiuw.widgetProviderOrder"') ||
      !widget.includes("struct SwapWidgetProvidersIntent") ||
      !widget.includes("store.saveWidgetProviderOrderRaw(next.rawValue)") ||
      !widget.includes("providerTitleAction: ProviderTitleAction = providers.count > 1 ? .swapColumns : .switchProvider") ||
      !widget.includes("case .swapColumns") ||
      !widget.includes("Capsule().fill(providerColor.opacity(0.14))") ||
      !widget.includes("static let providerHeight: CGFloat = 28") ||
      !widget.includes("static let compactProviderHeight: CGFloat = 24") ||
      !widget.includes("static let refreshHeight: CGFloat = 28") ||
      !widget.includes("static let refreshWidth: CGFloat = 44") ||
      !widget.includes(".frame(width: WidgetPillMetrics.refreshWidth, height: WidgetPillMetrics.refreshHeight)") ||
      !widget.includes(".frame(height: isCompact ? WidgetPillMetrics.compactProviderHeight : WidgetPillMetrics.providerHeight)") ||
      !widget.includes(".font(.system(size: isCompact ? 14 : 15, weight: .semibold))") ||
      !widget.includes(".font(.system(size: isCompact ? 9.5 : 11))") ||
      !widget.includes(".frame(height: isCompact ? 7 : 8)") ||
      !widget.includes(".offset(y: 3)") ||
      !widget.includes(".layoutPriority(3)") ||
      !widget.includes(".fixedSize(horizontal: true, vertical: false)")) {
    offenders.push("medium dual widget provider names must be capsule buttons that swap Claude/Codex column order");
  }

  if (offenders.length === 0) {
    pass("Widget family scope", "WidgetKit supports small single-provider refresh and medium provider capsule swap");
  } else {
    fail("Widget family scope", offenders.join(", "));
  }
}

function checkConnectorPublicNamePrivacy() {
  const config = read("connector/src/config.ts");
  const server = read("connector/src/server.ts");
  const configTests = read("connector/test/config.test.ts");
  const serverTests = read("connector/test/server.test.ts");
  const offenders = [];

  if (!config.includes("export function publicDeviceName")) {
    offenders.push("connector config must expose a single public device-name sanitizer");
  }
  if (!server.includes("name: publicDeviceName(options.config.name)")) {
    offenders.push("/v1/ping must sanitize the public device name at the HTTP boundary");
  }
  if (!configTests.includes("sanitizes and repairs network-like public device names")) {
    offenders.push("connector config tests must prove unsafe stored names are repaired");
  }
  if (!serverTests.includes("sanitizes unsafe public device name at the ping boundary")) {
    offenders.push("server tests must prove unsafe ping names cannot leak");
  }

  if (offenders.length === 0) {
    pass("Connector public name privacy", "connector repairs unsafe names and sanitizes /v1/ping output");
  } else {
    fail("Connector public name privacy", offenders.join("; "));
  }
}

function checkConnectorLanguageSettingIsSingle() {
  const dashboard = read("mac/AIUsageConnector/Sources/AIUsageConnector/Views/ConnectorDashboardView.swift");
  const menuBarContent = read("mac/AIUsageConnector/Sources/AIUsageConnector/Views/MenuBarContentView.swift");
  const app = read("mac/AIUsageConnector/Sources/AIUsageConnector/App/AIUsageConnectorApp.swift");
  const dashboardPickerCount = (dashboard.match(/LanguageMenuView\(\)/g) ?? []).length;
  const offenders = [];

  if (dashboardPickerCount !== 1 || !dashboard.includes("Label(AppText.language, systemImage: \"globe\")")) {
    offenders.push("connector dashboard must expose exactly one language picker in Settings");
  }
  if (menuBarContent.includes("LanguageMenuView()")) {
    offenders.push("menu bar popover must not duplicate the language setting");
  }
  if (app.includes("makeLanguageMenu") || app.includes("languageFromMenu")) {
    offenders.push("status menu must not duplicate the language setting");
  }

  if (offenders.length === 0) {
    pass("Connector language setting", "Mac connector exposes one language setting in Settings only");
  } else {
    fail("Connector language setting", offenders.join("; "));
  }
}

console.log("AI Usage Widget product invariants\n");
checkNoRuntimeAllowanceWording();
checkV1ProvidersAndFixtures();
checkContractUnavailableUsageShape();
checkWidgetHeaderCopy();
checkUserFacingWifiCopy();
checkJapaneseLanguageSupport();
checkPortugueseLanguageSupport();
checkPortugueseConnectorSettingsCopy();
checkMobileRefreshSurface();
checkMockingEmojiTone();
checkPreviewRendererInvariantGuard();
checkNoCacheHeaderCopy();
checkRuntimeProviderSurface();
checkWidgetFamilySurface();
checkNoGlobalOfflineDimming();
checkAppGroupRuntimeFallbackVisibility();
checkNoApprovalMessageInput();
checkDeviceProofCaptions();
checkApprovalRequestNullSemantics();
checkApprovalReceiptBinding();
checkLANPairedDeviceBinding();
checkApprovalDiagnosticPrivacy();
checkWidgetLANDiagnosticPrivacy();
checkAppLANDiagnosticDisplayPrivacy();
checkPairingDisplayPrivacy();
checkWidgetRefreshTotalBudget();
checkWidgetUsesPairingHostCap();
checkConnectorPublicNamePrivacy();
checkConnectorLanguageSettingIsSingle();

const width = Math.max(...rows.map((row) => row.name.length), 1);
for (const row of rows) {
  console.log(`${row.status.padEnd(4)} ${row.name.padEnd(width)}  ${row.detail}`);
}

const failed = rows.filter((row) => row.status === "FAIL").length;
console.log(`\n${rows.length - failed} passed, ${failed} failures`);

if (failed > 0) {
  process.exitCode = 1;
}
