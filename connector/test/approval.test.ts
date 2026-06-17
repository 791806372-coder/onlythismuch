import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  clearPendingApprovalRequest,
  findStoredApprovalDecision,
  getApprovalPaths,
  loadPendingApprovalRequest,
  loadStoredApprovalDecisions,
  parseApprovalDecisionInput,
  parseApprovalRequest,
  seedPendingApprovalRequest,
  storeApprovalDecision,
  storePendingApprovalRequest,
} from "../src/approval";

test("parses only minimal approval decision input", () => {
  assert.deepEqual(parseApprovalDecisionInput({
    schemaVersion: 1,
    requestId: "fixture-approval:1",
    action: "approve"
  }), {
    schemaVersion: 1,
    requestId: "fixture-approval:1",
    action: "approve"
  });

  assert.throws(() => parseApprovalDecisionInput({
    schemaVersion: 1,
    requestId: "fixture-approval:1",
    action: "maybe"
  }), /invalid_approval_action/);

  assert.throws(() => parseApprovalDecisionInput({
    schemaVersion: 1,
    requestId: "fixture approval",
    action: "deny"
  }), /invalid_approval_request/);
});

test("rejects approval text, prompts, comments, and secret-like values", () => {
  for (const unsafe of [
    { schemaVersion: 1, requestId: "fixture-approval", action: "approve", message: "go" },
    { schemaVersion: 1, requestId: "fixture-approval", action: "approve", comment: "go" },
    { schemaVersion: 1, requestId: "fixture-approval", action: "approve", prompt: "go" },
    { schemaVersion: 1, requestId: "fixture-approval", action: "approve", actionText: "go" },
    { schemaVersion: 1, requestId: "fixture-approval", action: "approve", note: "Bearer secret-token" },
    { schemaVersion: 1, requestId: "password-hunter2", action: "approve" },
  ]) {
    assert.throws(() => parseApprovalDecisionInput(unsafe), /unsafe_approval|unknown_approval_field/);
  }
});

test("stores approval decisions in a private local jsonl file", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-approval-"));
  const paths = getApprovalPaths(home);
  const now = new Date("2026-06-11T00:00:00.000Z");
  storePendingApprovalRequest({
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: now.toISOString()
  }, paths);

  const decision = storeApprovalDecision({
    schemaVersion: 1,
    requestId: "fixture-approval",
    action: "deny"
  }, paths, now);

  assert.equal(decision.decidedAt, now.toISOString());
  assert.equal(fs.statSync(paths.dir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(paths.decisionsFile).mode & 0o777, 0o600);
  assert.deepEqual(loadStoredApprovalDecisions(paths), [decision]);

  const stored = fs.readFileSync(paths.decisionsFile, "utf8");
  assert(!stored.includes("token"));
  assert(!stored.includes("Bearer"));
  assert(!stored.includes("Authorization"));
  assert(!stored.includes("transcript"));
  assert(!stored.includes("raw"));
});

test("rejects approval decisions without a matching pending Mac request", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-approval-"));
  const paths = getApprovalPaths(home);
  const now = new Date("2026-06-11T00:00:00.000Z");

  assert.throws(() => storeApprovalDecision({
    schemaVersion: 1,
    requestId: "missing-request",
    action: "approve"
  }, paths, now), /approval_request_not_pending/);
  assert.equal(fs.existsSync(paths.decisionsFile), false);

  storePendingApprovalRequest({
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: now.toISOString()
  }, paths);
  assert.throws(() => storeApprovalDecision({
    schemaVersion: 1,
    requestId: "other-request",
    action: "deny"
  }, paths, now), /approval_request_not_pending/);
  assert.equal(fs.existsSync(paths.decisionsFile), false);
  assert.equal(loadPendingApprovalRequest(paths, now)?.id, "fixture-approval");
});

test("stores and clears a bounded pending approval request", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-approval-"));
  const paths = getApprovalPaths(home);
  const now = new Date("2026-06-11T00:00:00.000Z");

  const request = seedPendingApprovalRequest(paths, now);

  assert.equal(request.id, "fixture-1781136000");
  assert.equal(request.source, "Mac 请求");
  assert.equal(request.title, "允许这一步继续？");
  assert.equal(fs.statSync(paths.dir).mode & 0o777, 0o700);
  assert.equal(fs.statSync(paths.pendingRequestFile).mode & 0o777, 0o600);
  assert.deepEqual(loadPendingApprovalRequest(paths, now), request);

  const stored = fs.readFileSync(paths.pendingRequestFile, "utf8");
  assert(!stored.includes("token"));
  assert(!stored.includes("Bearer"));
  assert(!stored.includes("Authorization"));
  assert(!stored.includes("transcript"));
  assert(!stored.includes("raw"));

  clearPendingApprovalRequest(paths);
  assert.equal(loadPendingApprovalRequest(paths, now), undefined);
});

test("pending approval request expires and is removed", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-approval-"));
  const paths = getApprovalPaths(home);
  const now = new Date("2026-06-11T00:00:00.000Z");
  const request = storePendingApprovalRequest({
    schemaVersion: 1,
    id: "fixture-expiring",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString()
  }, paths);

  assert.deepEqual(loadPendingApprovalRequest(paths, now), request);
  assert.equal(loadPendingApprovalRequest(paths, new Date(now.getTime() + 60_001)), undefined);
  assert.equal(fs.existsSync(paths.pendingRequestFile), false);
});

test("matching decision clears pending approval request", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-approval-"));
  const paths = getApprovalPaths(home);
  const now = new Date("2026-06-11T00:00:00.000Z");
  const request = seedPendingApprovalRequest(paths, now);

  storeApprovalDecision({
    schemaVersion: 1,
    requestId: request.id,
    action: "approve"
  }, paths, now);

  assert.equal(loadPendingApprovalRequest(paths, now), undefined);
});

test("matching stored approval decision can be reused for retry receipts", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-approval-"));
  const paths = getApprovalPaths(home);
  const now = new Date("2026-06-11T00:00:00.000Z");
  const request = seedPendingApprovalRequest(paths, now);

  const decision = storeApprovalDecision({
    schemaVersion: 1,
    requestId: request.id,
    action: "approve"
  }, paths, now);

  assert.deepEqual(findStoredApprovalDecision({
    schemaVersion: 1,
    requestId: request.id,
    action: "approve"
  }, paths), decision);
  assert.equal(findStoredApprovalDecision({
    schemaVersion: 1,
    requestId: request.id,
    action: "deny"
  }, paths), undefined);
});

test("rejects unsafe or unknown pending approval request fields", () => {
  assert.deepEqual(parseApprovalRequest({
    schemaVersion: 1,
    id: "fixture-request",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z",
    expiresAt: "2026-06-11T00:15:00.000Z"
  }), {
    schemaVersion: 1,
    id: "fixture-request",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z",
    expiresAt: "2026-06-11T00:15:00.000Z"
  });

  for (const unsafe of [
    { schemaVersion: 1, id: "fixture-request", source: "Mac 请求", title: "Bearer secret-token", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture-request", source: "http://192.168.1.7", title: "允许这一步继续？", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture-request", source: "KaideMacBook-Pro.local", title: "允许这一步继续？", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture-request", source: "localhost", title: "允许这一步继续？", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture-request", source: "Mac 请求", title: "去 http://KaideMacBook-Pro.local 看", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture-request", source: "Mac 请求", title: "password=hunter2", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture-request", source: "Mac 请求", title: "passphrase: do-not-ship", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture-request", source: "Mac 请求", title: "允许这一步继续？", prompt: "go", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture request", source: "Mac 请求", title: "允许这一步继续？", createdAt: "2026-06-11T00:00:00.000Z" },
    { schemaVersion: 1, id: "fixture-request", source: "Mac 请求", title: "允许这一步继续？", createdAt: "June 11, 2026" },
  ]) {
    assert.throws(() => parseApprovalRequest(unsafe), /unsafe_approval|unknown_approval|invalid_approval/);
  }
});
