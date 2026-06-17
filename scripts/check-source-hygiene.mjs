import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function pathExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function requirePath(relativePath) {
  if (!pathExists(relativePath)) {
    failures.push(`missing source anchor: ${relativePath}`);
  }
}

function requireIgnore(filePath, pattern) {
  const lines = readText(filePath).split(/\r?\n/);
  if (!lines.includes(pattern)) {
    failures.push(`${filePath} must include ${pattern}`);
  }
}

const rootIgnores = [
  "node_modules/",
  ".npm-cache/",
  "*.xcodeproj/",
  "Local.xcconfig",
  "build/",
  "dist/",
  ".swift-module-cache/",
  "work/XcodeGen/",
  "outputs/widget-previews/",
  "outputs/device-evidence/00-*.json",
  "outputs/device-evidence/screenshot-proofs.json"
];

for (const pattern of rootIgnores) {
  requireIgnore(".gitignore", pattern);
}

for (const pattern of ["node_modules/", "dist/"]) {
  requireIgnore("connector/.gitignore", pattern);
}

for (const pattern of ["*.xcodeproj", "Config/Local.xcconfig"]) {
  requireIgnore("ios/.gitignore", pattern);
}

const sourceAnchors = [
  "CONTRACT.md",
  "README.md",
  "package.json",
  "src/contract/schema.ts",
  "connector/src",
  "ios/project.yml",
  "ios/Shared",
  "ios/AIUsageWidgetApp",
  "ios/AIUsageWidgetExtension",
  "ios/AIUsageWidgetTests",
  "ios/Tools",
  "fixtures",
  "tests",
  "scripts",
  "outputs/AI-Usage-Widget-Implementation-Status.md",
  "outputs/device-evidence/manifest.json"
];

for (const anchor of sourceAnchors) {
  requirePath(anchor);
}

const generatedLocalArtifacts = [
  "node_modules",
  "connector/node_modules",
  "connector/dist",
  "build",
  ".swift-module-cache",
  "work/XcodeGen",
  "ios/AIUsageWidget.xcodeproj",
  "outputs/widget-previews",
  "outputs/device-evidence/00-device-readiness.json",
  "outputs/device-evidence/00-evidence-summary.json",
  "outputs/device-evidence/00-local-evidence-summary.json",
  "outputs/device-evidence/00-install-summary.json",
  "outputs/device-evidence/screenshot-proofs.json"
];

const presentGeneratedArtifacts = generatedLocalArtifacts.filter(pathExists);
const readme = readText("README.md");
const requiredReadmeText = [
  "## Source Hygiene",
  "Authoritative source lives in",
  "Generated, vendor, or local proof artifacts include",
  "`work/XcodeGen`",
  "`connector/dist`",
  "`outputs/device-evidence/manifest.json`",
  "`outputs/device-evidence/00-*.json`"
];

for (const text of requiredReadmeText) {
  if (!readme.includes(text)) {
    failures.push(`README.md must document source hygiene text: ${text}`);
  }
}

if (failures.length > 0) {
  console.error("source hygiene check failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `validated source hygiene: ${sourceAnchors.length} source anchors, ${presentGeneratedArtifacts.length} generated/local artifact roots documented`
);
