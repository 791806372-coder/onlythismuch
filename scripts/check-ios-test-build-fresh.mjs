import { iosTestBuildFreshness } from "./lib/ios-build-freshness.mjs";

const repoRoot = process.cwd();
const freshness = iosTestBuildFreshness(repoRoot);

if (!freshness.present) {
  console.error(`Native XCTest build proof is missing: ${freshness.detail}`);
  console.error("Run npm run build:ios:tests, then rerun npm run check:ios-tests:fresh.");
  process.exit(1);
}

if (!freshness.fresh) {
  console.error(`Native XCTest build proof is stale: ${freshness.detail}`);
  console.error("Run npm run build:ios:tests after iOS source/config changes.");
  process.exit(1);
}

console.log("validated fresh native XCTest build proof");
