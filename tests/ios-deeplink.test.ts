import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

describe("iOS widget deeplink", () => {
  it("registers and uses the aiusage refresh URL", () => {
    const appPlist = readFileSync("ios/AIUsageWidgetApp/Info.plist", "utf8");
    const appView = readFileSync("ios/AIUsageWidgetApp/ContentView.swift", "utf8");
    const tapProof = readFileSync("ios/Shared/WidgetTapProof.swift", "utf8");
    const widgetView = readFileSync("ios/AIUsageWidgetExtension/AIUsageWidget.swift", "utf8");

    assert.match(appPlist, /<key>CFBundleURLSchemes<\/key>[\s\S]*<string>aiusage<\/string>/);
    assert.match(widgetView, /widgetURL\(URL\(string: "aiusage:\/\/refresh"\)\)/);
    assert.match(appView, /onOpenURL/);
    assert.match(appView, /WidgetRefreshDeepLink\.isRefreshURL\(url\)/);
    assert.match(appView, /await refreshFromWidgetTap\(\)/);
    assert.match(appView, /refreshFromLAN\(/);
    assert.match(appView, /try store\.saveCachedSnapshot\(snapshotResult\.value, source: "lan"\)/);
    assert.match(appView, /widgetOpenProofText = WidgetTapProofText\.openedRefreshing\(\)/);
    assert.match(tapProof, /static let scheme = "aiusage"/);
    assert.match(tapProof, /static let refreshHost = "refresh"/);
    assert.match(tapProof, /Proof 07 · 还没从 Widget 打开/);
  });
});
