import fs from "node:fs";
import path from "node:path";
import { getConfigPaths } from "./config";

export type ApprovalAction = "approve" | "deny";

export type ApprovalDecisionInput = {
  schemaVersion: 1;
  requestId: string;
  action: ApprovalAction;
};

export type ApprovalRequest = {
  schemaVersion: 1;
  id: string;
  source: string;
  title: string;
  createdAt: string;
  expiresAt?: string;
};

export type StoredApprovalDecision = ApprovalDecisionInput & {
  decidedAt: string;
};

export type ApprovalPaths = {
  dir: string;
  decisionsFile: string;
  pendingRequestFile: string;
};

const ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const FORBIDDEN_KEY_RE = /token|cookie|secret|key|credential|password|passphrase|passwd|prompt|message|comment|reason|text|transcript|raw/i;
const FORBIDDEN_VALUE_RE = /\b(?:api[_-]?token|authorization|bearer|cookie|secret|credential|password|passphrase|passwd|keychain|transcript|prompt|message|raw\s+(?:stdout|stderr|log|output)|provider\s+output)\b/i;
const EMAIL_VALUE_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_OR_HOST_VALUE_RE = /(?:https?:\/\/|(?:^|[^A-Z0-9-])localhost(?:[^A-Z0-9-]|$)|[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.local\b|[A-Z0-9.-]+\.[A-Z]{2,}(?:\b|\/))/i;
const IP_ADDRESS_VALUE_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;
const IOS_ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_SAFE_STRING_LENGTH = 200;

export function getApprovalPaths(homeDir?: string): ApprovalPaths {
  const configPaths = getConfigPaths(homeDir);
  return {
    dir: configPaths.dir,
    decisionsFile: path.join(configPaths.dir, "approval-decisions.jsonl"),
    pendingRequestFile: path.join(configPaths.dir, "approval-request.json")
  };
}

export function parseApprovalDecisionInput(value: unknown): ApprovalDecisionInput {
  assertSafeApprovalValue(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_approval_body");
  }

  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["schemaVersion", "requestId", "action"]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error("unknown_approval_field");
    }
  }

  if (input.schemaVersion !== 1) {
    throw new Error("unsupported_approval_schema");
  }
  if (typeof input.requestId !== "string" || !ID_RE.test(input.requestId)) {
    throw new Error("invalid_approval_request");
  }
  if (input.action !== "approve" && input.action !== "deny") {
    throw new Error("invalid_approval_action");
  }

  return {
    schemaVersion: 1,
    requestId: input.requestId,
    action: input.action
  };
}

export function storeApprovalDecision(
  input: ApprovalDecisionInput,
  paths = getApprovalPaths(),
  now = new Date()
): StoredApprovalDecision {
  const decision: StoredApprovalDecision = {
    ...parseApprovalDecisionInput(input),
    decidedAt: now.toISOString()
  };
  const pending = loadPendingApprovalRequest(paths, now);
  if (pending?.id !== decision.requestId) {
    throw new Error("approval_request_not_pending");
  }

  ensurePrivateDir(paths.dir);
  fs.appendFileSync(paths.decisionsFile, `${JSON.stringify(decision)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  fs.chmodSync(paths.decisionsFile, 0o600);
  clearPendingApprovalRequest(paths);

  return decision;
}

export function findStoredApprovalDecision(
  input: ApprovalDecisionInput,
  paths = getApprovalPaths()
): StoredApprovalDecision | undefined {
  const parsed = parseApprovalDecisionInput(input);
  return loadStoredApprovalDecisions(paths).find((decision) =>
    decision.requestId === parsed.requestId &&
    decision.action === parsed.action
  );
}

export function loadStoredApprovalDecisions(paths = getApprovalPaths()): StoredApprovalDecision[] {
  if (!fs.existsSync(paths.decisionsFile)) {
    return [];
  }
  ensurePrivateFile(paths.decisionsFile);
  return fs
    .readFileSync(paths.decisionsFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => parseStoredApprovalDecision(JSON.parse(line)));
}

export function parseApprovalRequest(value: unknown): ApprovalRequest {
  assertSafeApprovalValue(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_approval_request_body");
  }

  const input = value as Record<string, unknown>;
  const allowedKeys = new Set(["schemaVersion", "id", "source", "title", "createdAt", "expiresAt"]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error("unknown_approval_request_field");
    }
  }

  if (input.schemaVersion !== 1) {
    throw new Error("unsupported_approval_request_schema");
  }
  if (typeof input.id !== "string" || !ID_RE.test(input.id)) {
    throw new Error("invalid_approval_request_id");
  }
  const source = boundedText(input.source, "source", 40);
  const title = boundedText(input.title, "title", 60);
  const createdAt = isoDate(input.createdAt, "createdAt");
  const expiresAt = input.expiresAt === undefined
    ? undefined
    : isoDate(input.expiresAt, "expiresAt");

  return {
    schemaVersion: 1,
    id: input.id,
    source,
    title,
    createdAt,
    ...(expiresAt ? { expiresAt } : {})
  };
}

export function storePendingApprovalRequest(
  request: ApprovalRequest,
  paths = getApprovalPaths()
): ApprovalRequest {
  const parsed = parseApprovalRequest(request);
  ensurePrivateDir(paths.dir);
  fs.writeFileSync(paths.pendingRequestFile, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  fs.chmodSync(paths.pendingRequestFile, 0o600);
  return parsed;
}

export function loadPendingApprovalRequest(
  paths = getApprovalPaths(),
  now = new Date()
): ApprovalRequest | undefined {
  if (!fs.existsSync(paths.pendingRequestFile)) {
    return undefined;
  }
  ensurePrivateFile(paths.pendingRequestFile);
  const request = parseApprovalRequest(JSON.parse(fs.readFileSync(paths.pendingRequestFile, "utf8")));
  if (request.expiresAt && Date.parse(request.expiresAt) <= now.getTime()) {
    clearPendingApprovalRequest(paths);
    return undefined;
  }
  return request;
}

export function clearPendingApprovalRequest(paths = getApprovalPaths()): void {
  if (fs.existsSync(paths.pendingRequestFile)) {
    fs.unlinkSync(paths.pendingRequestFile);
  }
}

export function seedPendingApprovalRequest(
  paths = getApprovalPaths(),
  now = new Date()
): ApprovalRequest {
  return storePendingApprovalRequest({
    schemaVersion: 1,
    id: `fixture-${Math.floor(now.getTime() / 1000)}`,
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString()
  }, paths);
}

function parseStoredApprovalDecision(value: unknown): StoredApprovalDecision {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid_approval_decision");
  }
  const stored = value as Record<string, unknown>;
  const input = parseApprovalDecisionInput({
    schemaVersion: stored.schemaVersion,
    requestId: stored.requestId,
    action: stored.action
  });
  const decidedAt = (value as { decidedAt?: unknown }).decidedAt;
  if (typeof decidedAt !== "string" || Number.isNaN(Date.parse(decidedAt))) {
    throw new Error("invalid_approval_decision");
  }
  return {
    ...input,
    decidedAt
  };
}

function boundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(`invalid_approval_${label}`);
  }
  return value;
}

function isoDate(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !IOS_ISO_DATE_RE.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error(`invalid_approval_${label}`);
  }
  return value;
}

function ensurePrivateDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    throw new Error(`Invalid aiuw approval directory at ${dir}`);
  }
  if ((stat.mode & 0o077) !== 0) {
    fs.chmodSync(dir, 0o700);
  }
}

function ensurePrivateFile(file: string): void {
  const mode = fs.statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    fs.chmodSync(file, 0o600);
  }
}

function assertSafeApprovalValue(value: unknown): void {
  inspect(value, "$");
}

function inspect(value: unknown, pathLabel: string): void {
  if (typeof value === "string") {
    if (
      value.length > MAX_SAFE_STRING_LENGTH ||
      EMAIL_VALUE_RE.test(value) ||
      FORBIDDEN_VALUE_RE.test(value) ||
      URL_OR_HOST_VALUE_RE.test(value) ||
      IP_ADDRESS_VALUE_RE.test(value)
    ) {
      throw new Error(`unsafe_approval_value:${pathLabel}`);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      inspect(item, `${pathLabel}[${index}]`);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`unsafe_approval_key:${pathLabel}.${key}`);
    }
    inspect(nested, `${pathLabel}.${key}`);
  }
}
