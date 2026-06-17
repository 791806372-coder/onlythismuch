import fs from "node:fs";
import path from "node:path";
import { iphoneosBuildFreshness } from "./ios-build-freshness.mjs";

const COMMON_INPUTS = [
  "ios/Config/Local.xcconfig",
  "ios/AIUsageWidget.xcodeproj/project.pbxproj",
  "ios/project.yml",
];

const APPINTENT_INPUT_ROOTS = [
  "ios/AIUsageWidgetExtension",
  "ios/Shared",
];

export const APPINTENT_METADATA_RELATIVE_PATHS = [
  "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetExtension.appex/Metadata.appintents/extract.actionsdata",
  "build/DerivedData/Build/Products/Debug-iphoneos/AIUsageWidgetApp.app/PlugIns/AIUsageWidgetExtension.appex/Metadata.appintents/extract.actionsdata",
];

const EXPECTED_ACTIONS = [
  {
    name: "AIUsageWidgetConfigurationIntent",
    parameters: ["provider"],
  },
  {
    name: "ApprovalDecisionIntent",
    parameters: ["actionRawValue", "requestId"],
  },
  {
    name: "RefreshUsageIntent",
    parameters: [],
  },
  {
    name: "SwapWidgetProvidersIntent",
    parameters: [],
  },
  {
    name: "ToggleWidgetProviderIntent",
    parameters: ["providerId"],
  },
];
const FORBIDDEN_PARAMETER_RE = /\b(?:message|comment|prompt|freeform|text|body|reason)\b/i;

export function validateAppIntentMetadata(repoRoot) {
  const rows = [];
  const freshness = iphoneosBuildFreshness(repoRoot);

  if (!freshness.present) {
    rows.push({
      status: "FAIL",
      name: "Unsigned iPhone build",
      detail: `missing build products: ${freshness.detail}`,
    });
    return result(rows);
  }

  if (!freshness.fresh) {
    rows.push({
      status: "FAIL",
      name: "Unsigned iPhone build",
      detail: `stale build products: ${freshness.detail}`,
    });
    return result(rows);
  }

  rows.push({
    status: "PASS",
    name: "Unsigned iPhone build",
    detail: "Debug-iphoneos app/widget outputs are fresh",
  });

  const metadataFreshness = appIntentMetadataFreshness(repoRoot);
  if (!metadataFreshness.fresh) {
    rows.push({
      status: "FAIL",
      name: "AppIntent metadata freshness",
      detail: metadataFreshness.detail,
    });
    return result(rows);
  }
  rows.push({
    status: "PASS",
    name: "AppIntent metadata freshness",
    detail: metadataFreshness.detail,
  });

  for (const relativePath of APPINTENT_METADATA_RELATIVE_PATHS) {
    rows.push(...validateMetadataFile(repoRoot, relativePath));
  }

  return result(rows);
}

function appIntentMetadataFreshness(repoRoot) {
  const inputFiles = unique([
    ...COMMON_INPUTS.map((relativePath) => path.join(repoRoot, relativePath)),
    ...APPINTENT_INPUT_ROOTS.flatMap((relativeRoot) => listFiles(path.join(repoRoot, relativeRoot))),
  ]).filter((file) => fs.existsSync(file));
  const metadataFiles = APPINTENT_METADATA_RELATIVE_PATHS
    .map((relativePath) => path.join(repoRoot, relativePath));
  const missing = metadataFiles
    .filter((file) => !fs.existsSync(file))
    .map((file) => path.relative(repoRoot, file));
  if (missing.length > 0) {
    return {
      fresh: false,
      detail: `missing ${missing.join(", ")}`,
    };
  }

  const newestInput = newest(inputFiles);
  const oldestMetadata = oldest(metadataFiles);
  if (!newestInput || !oldestMetadata) {
    return {
      fresh: false,
      detail: "timestamp unavailable",
    };
  }

  const fresh = newestInput.mtimeMs <= oldestMetadata.mtimeMs + 1000;
  return {
    fresh,
    detail: fresh
      ? "direct and embedded actionsdata are newer than AppIntent inputs"
      : `${path.relative(repoRoot, newestInput.file)} is newer than ${path.relative(repoRoot, oldestMetadata.file)}`,
  };
}

function validateMetadataFile(repoRoot, relativePath) {
  const rows = [];
  const absolutePath = path.join(repoRoot, relativePath);
  const label = relativePath.includes("/PlugIns/")
    ? "Embedded widget metadata"
    : "Direct widget metadata";

  if (!fs.existsSync(absolutePath)) {
    return [{
      status: "FAIL",
      name: label,
      detail: `${relativePath} missing`,
    }];
  }

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch {
    return [{
      status: "FAIL",
      name: label,
      detail: `${relativePath} is not valid JSON`,
    }];
  }

  const actions = metadata?.actions;
  if (!actions || typeof actions !== "object" || Array.isArray(actions)) {
    return [{
      status: "FAIL",
      name: label,
      detail: "metadata has no actions object",
    }];
  }

  const actionNames = Object.keys(actions).sort();
  const expectedActionNames = EXPECTED_ACTIONS.map((action) => action.name).sort();
  if (actionNames.join(",") !== expectedActionNames.join(",")) {
    rows.push({
      status: "FAIL",
      name: label,
      detail: `expected only ${expectedActionNames.join(",")}, got ${actionNames.join(",") || "none"}`,
    });
    return rows;
  }

  for (const expectedAction of EXPECTED_ACTIONS) {
    rows.push(validateAction(label, actions[expectedAction.name], expectedAction));
  }

  return rows;
}

function validateAction(label, action, expectedAction) {
  const parameters = Array.isArray(action?.parameters) ? action.parameters : [];
  const invalidParameterIndexes = parameters
    .map((parameter, index) => ({
      index,
      valid: parameter && typeof parameter === "object" && typeof parameter.name === "string" && parameter.name.length > 0,
    }))
    .filter((entry) => !entry.valid)
    .map((entry) => entry.index);
  const nonFalseInputIndexes = parameters
    .map((parameter, index) => ({
      index,
      value: parameter?.isInput,
    }))
    .filter((entry) => entry.value !== false)
    .map((entry) => entry.index);
  const parameterNames = parameters
    .map((parameter) => parameter?.name)
    .filter((name) => typeof name === "string")
    .sort();
  const inputParameters = parameters
    .filter((parameter) => parameter?.isInput === true)
    .map((parameter) => parameter?.name)
    .map((name, index) => typeof name === "string" && name.length > 0 ? name : `#${index}`);
  const forbiddenParameters = parameterNames.filter((name) => FORBIDDEN_PARAMETER_RE.test(name));
  const issues = [];

  if (action?.identifier !== expectedAction.name) {
    issues.push(`identifier=${String(action?.identifier)}`);
  }
  if (typeof action?.fullyQualifiedTypeName !== "string" ||
      !action.fullyQualifiedTypeName.endsWith(`.${expectedAction.name}`)) {
    issues.push(`fullyQualifiedTypeName=${String(action?.fullyQualifiedTypeName)}`);
  }
  if (action?.openAppWhenRun !== false) {
    issues.push(`openAppWhenRun=${String(action?.openAppWhenRun)}`);
  }
  if (parameters.length !== expectedAction.parameters.length) {
    issues.push(`parameter count=${parameters.length}`);
  }
  if (invalidParameterIndexes.length > 0) {
    issues.push(`invalid parameter entries=${invalidParameterIndexes.join(",")}`);
  }
  if (nonFalseInputIndexes.length > 0) {
    issues.push(`non-false isInput entries=${nonFalseInputIndexes.join(",")}`);
  }
  if (parameterNames.join(",") !== expectedAction.parameters.join(",")) {
    issues.push(`parameters=${parameterNames.join(",") || "none"}`);
  }
  if (inputParameters.length > 0) {
    issues.push(`interactive inputs=${inputParameters.join(",")}`);
  }
  if (forbiddenParameters.length > 0) {
    issues.push(`forbidden parameters=${forbiddenParameters.join(",")}`);
  }

  return {
    status: issues.length === 0 ? "PASS" : "FAIL",
    name: `${label} ${expectedAction.name}`,
    detail: issues.length === 0
      ? `${expectedAction.name}, openAppWhenRun=false, parameters=${parameterNames.join(",") || "none"}`
      : issues.join("; "),
  };
}

function result(rows) {
  const failures = rows.filter((row) => row.status === "FAIL").length;
  return {
    ok: failures === 0,
    rows,
    passed: rows.length - failures,
    failures,
  };
}

function listFiles(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const stat = fs.statSync(root);
  if (stat.isFile()) {
    return [root];
  }

  const pending = [root];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    const currentStat = fs.statSync(current);
    if (currentStat.isDirectory()) {
      for (const child of fs.readdirSync(current)) {
        if (child === ".DS_Store") {
          continue;
        }
        pending.push(path.join(current, child));
      }
    } else if (currentStat.isFile()) {
      files.push(current);
    }
  }
  return files.sort();
}

function newest(files) {
  return files
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
}

function oldest(files) {
  return files
    .map((file) => ({ file, mtimeMs: fs.statSync(file).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs)[0];
}

function unique(values) {
  return [...new Set(values)];
}
