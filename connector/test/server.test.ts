import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findStoredApprovalDecision,
  getApprovalPaths,
  loadPendingApprovalRequest,
  loadStoredApprovalDecisions,
  storeApprovalDecision,
  storePendingApprovalRequest,
  type ApprovalDecisionInput,
  type ApprovalRequest,
  type StoredApprovalDecision,
} from "../src/approval";
import { parseSnapshot } from "../../src/contract/schema";
import { createConnectorServer } from "../src/server";
import type { ServerOptions } from "../src/server";

const config = {
  version: 1 as const,
  deviceId: "mac-test",
  name: "Test Mac",
  token: "test-token",
  updatedAt: "2026-06-11T00:00:00.000Z"
};

const snapshot = parseSnapshot({
  schemaVersion: 1,
  device: {
    id: "mac-test",
    name: "Test Mac",
    platform: "macOS",
    connectorVersion: "0.1.0",
    online: true,
    updatedAt: "2026-06-11T00:00:00.000Z"
  },
  providers: [
    {
      id: "claude",
      displayName: "Claude",
      connected: true,
      health: "working",
      version: "2.1.173",
      usage: {
        available: false,
        reason: "no_stable_source",
      },
    },
    {
      id: "codex",
      displayName: "Codex",
      connected: true,
      health: "working",
      version: "0.139.0",
      capturedAt: "2026-06-11T00:00:00.000Z",
      usage: {
        available: true,
        source: "codexbar",
        sourceVersion: "1.0.0",
        fiveHourRemainingPercent: 85,
        fiveHourResetAt: "2026-06-11T20:30:00+08:00",
        weeklyRemainingPercent: 27,
        weeklyResetAt: "2026-06-11T21:45:00+08:00"
      }
    }
  ]
});

async function withServer(
  callback: (baseUrl: string) => Promise<void>,
  overrides: Partial<ServerOptions> = {}
): Promise<void> {
  const server = createConnectorServer({ config, snapshot, port: 0, host: "127.0.0.1", ...overrides });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("requires bearer token", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/ping`);
    assert.equal(response.status, 401);
  });
});

test("serves ping and snapshot with bearer token", async () => {
  await withServer(async (baseUrl) => {
    const headers = { authorization: "Bearer test-token" };

    const ping = await fetch(`${baseUrl}/v1/ping`, { headers });
    assert.equal(ping.status, 200);
    assert.deepEqual(await ping.json(), {
      ok: true,
      deviceId: "mac-test",
      name: "Test Mac"
    });

    const snapshotResponse = await fetch(`${baseUrl}/v1/snapshot`, { headers });
    assert.equal(snapshotResponse.status, 200);
    assert.deepEqual(await snapshotResponse.json(), snapshot);
  });
});

test("sanitizes unsafe public device name at the ping boundary", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/ping`, {
      headers: { authorization: "Bearer test-token" }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.name, "Mac connector");
    assert.equal(JSON.stringify(body).includes("kai-mac.local"), false);
  }, {
    config: {
      ...config,
      name: "kai-mac.local"
    }
  });
});

test("can reload auth token while server is running", async () => {
  let token = "old-token";

  await withServer(async (baseUrl) => {
    const oldHeaders = { authorization: "Bearer old-token" };
    const newHeaders = { authorization: "Bearer new-token" };

    const beforeRotation = await fetch(`${baseUrl}/v1/ping`, { headers: oldHeaders });
    assert.equal(beforeRotation.status, 200);

    token = "new-token";

    const afterRotation = await fetch(`${baseUrl}/v1/ping`, { headers: newHeaders });
    assert.equal(afterRotation.status, 200);

    const staleToken = await fetch(`${baseUrl}/v1/ping`, { headers: oldHeaders });
    assert.equal(staleToken.status, 401);
  }, {
    getAuthToken: () => token
  });
});

test("serves the latest snapshot from getSnapshot", async () => {
  let dynamicSnapshot = snapshot;
  const updatedSnapshot = {
    ...snapshot,
    device: {
      ...snapshot.device,
      updatedAt: "2026-06-11T00:01:00.000Z",
    },
  };

  await withServer(async (baseUrl) => {
    const headers = { authorization: "Bearer test-token" };

    dynamicSnapshot = updatedSnapshot;
    const snapshotResponse = await fetch(`${baseUrl}/v1/snapshot`, { headers });

    assert.equal(snapshotResponse.status, 200);
    assert.equal((await snapshotResponse.json()).device.updatedAt, updatedSnapshot.device.updatedAt);
  }, {
    getSnapshot: () => dynamicSnapshot
  });
});

test("validates snapshot at the HTTP egress boundary", async () => {
  const unsafeSnapshot = {
    ...snapshot,
    providers: [
      {
        ...snapshot.providers[0],
        apiToken: "do-not-ship"
      }
    ]
  } as unknown as typeof snapshot;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/snapshot`, {
      headers: { authorization: "Bearer test-token" }
    });
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.equal(body, JSON.stringify({ error: "snapshot_validation_failed" }));
    assert(!body.includes("do-not-ship"));
    assert(!body.includes("apiToken"));
  }, {
    getSnapshot: () => unsafeSnapshot
  });
});

test("records approval decisions through a separate authenticated endpoint", async () => {
  const recorded: ApprovalDecisionInput[] = [];
  const request: ApprovalRequest = {
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z",
  };

  await withServer(async (baseUrl) => {
    const headers = {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    };
    const response = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: "fixture-approval",
        action: "approve"
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      schemaVersion: 1,
      requestId: "fixture-approval",
      action: "approve",
      decidedAt: "2026-06-11T00:00:00.000Z"
    });
    assert.deepEqual(recorded, [{
      schemaVersion: 1,
      requestId: "fixture-approval",
      action: "approve"
    }]);
  }, {
    recordApprovalDecision: (decision): StoredApprovalDecision => {
      recorded.push(decision);
      return {
        ...decision,
        decidedAt: "2026-06-11T00:00:00.000Z"
      };
    },
    getApprovalRequest: () => request
  });
});

test("serves pending approval request through a separate authenticated endpoint", async () => {
  await withServer(async (baseUrl) => {
    const headers = { authorization: "Bearer test-token" };
    const response = await fetch(`${baseUrl}/v1/approval-request`, { headers });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      request: {
        schemaVersion: 1,
        id: "fixture-approval",
        source: "Mac 请求",
        title: "允许这一步继续？",
        createdAt: "2026-06-11T00:00:00.000Z",
        expiresAt: "2026-06-11T00:15:00.000Z"
      }
    });
  }, {
    getApprovalRequest: () => ({
      schemaVersion: 1,
      id: "fixture-approval",
      source: "Mac 请求",
      title: "允许这一步继续？",
      createdAt: "2026-06-11T00:00:00.000Z",
      expiresAt: "2026-06-11T00:15:00.000Z"
    })
  });
});

test("serves null approval request when no Mac approval is pending", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/approval-request`, {
      headers: { authorization: "Bearer test-token" }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      request: null
    });
  }, {
    getApprovalRequest: () => undefined
  });
});

test("requires auth before serving pending approval request", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/approval-request`);
    const body = await response.text();

    assert.equal(response.status, 401);
    assert.equal(body, JSON.stringify({ error: "unauthorized" }));
    assert(!body.includes("fixture-approval"));
    assert(!body.includes("允许这一步继续"));
  }, {
    getApprovalRequest: () => ({
      schemaVersion: 1,
      id: "fixture-approval",
      source: "Mac 请求",
      title: "允许这一步继续？",
      createdAt: "2026-06-11T00:00:00.000Z",
    })
  });
});

test("validates pending approval request at the HTTP egress boundary", async () => {
  const unsafeRequest = {
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "Bearer secret-token",
    createdAt: "2026-06-11T00:00:00.000Z",
    apiToken: "do-not-ship"
  } as unknown as ApprovalRequest;

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/approval-request`, {
      headers: { authorization: "Bearer test-token" }
    });
    const body = await response.text();

    assert.equal(response.status, 500);
    assert.equal(body, JSON.stringify({ error: "approval_request_unavailable" }));
    assert(!body.includes("do-not-ship"));
    assert(!body.includes("apiToken"));
    assert(!body.includes("secret-token"));
    assert(!body.includes("允许这一步继续"));
  }, {
    getApprovalRequest: () => unsafeRequest
  });
});

test("matching approval decision clears the pending Mac request", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-server-approval-"));
  const paths = getApprovalPaths(home);
  const request = storePendingApprovalRequest({
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z"
  }, paths);

  await withServer(async (baseUrl) => {
    const headers = {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    };

    const before = await fetch(`${baseUrl}/v1/approval-request`, { headers });
    assert.equal(before.status, 200);
    assert.deepEqual(await before.json(), {
      ok: true,
      request
    });

    const decision = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: request.id,
        action: "approve"
      })
    });
    assert.equal(decision.status, 200);

    const after = await fetch(`${baseUrl}/v1/approval-request`, { headers });
    assert.equal(after.status, 200);
    assert.deepEqual(await after.json(), {
      ok: true,
      request: null
    });
  }, {
    getApprovalRequest: () => loadPendingApprovalRequest(paths),
    recordApprovalDecision: (decision) => storeApprovalDecision(
      decision,
      paths,
      new Date("2026-06-11T00:01:00.000Z")
    )
  });
});

test("matching approval decision retry returns stored receipt after pending request clears", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-server-approval-"));
  const paths = getApprovalPaths(home);
  const request = storePendingApprovalRequest({
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z"
  }, paths);

  await withServer(async (baseUrl) => {
    const headers = {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    };
    const body = JSON.stringify({
      schemaVersion: 1,
      requestId: request.id,
      action: "deny"
    });

    const first = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers,
      body
    });
    assert.equal(first.status, 200);
    const firstReceipt = await first.json();
    assert.equal(firstReceipt.decidedAt, "2026-06-11T00:01:00.000Z");

    const retry = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers,
      body
    });
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), firstReceipt);
    assert.equal(loadPendingApprovalRequest(paths), undefined);
    assert.equal(loadStoredApprovalDecisions(paths).length, 1);
  }, {
    getApprovalRequest: () => loadPendingApprovalRequest(paths),
    getStoredApprovalDecision: (decision) => findStoredApprovalDecision(decision, paths),
    recordApprovalDecision: (decision) => storeApprovalDecision(
      decision,
      paths,
      new Date("2026-06-11T00:01:00.000Z")
    )
  });
});

test("matching approval decision does not reuse a stale receipt when a new request is pending", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-server-approval-"));
  const paths = getApprovalPaths(home);
  const request = storePendingApprovalRequest({
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z"
  }, paths);

  storeApprovalDecision({
    schemaVersion: 1,
    requestId: request.id,
    action: "approve"
  }, paths, new Date("2026-06-11T00:01:00.000Z"));
  storePendingApprovalRequest({
    schemaVersion: 1,
    id: request.id,
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:02:00.000Z"
  }, paths);

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: request.id,
        action: "approve"
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      schemaVersion: 1,
      requestId: request.id,
      action: "approve",
      decidedAt: "2026-06-11T00:03:00.000Z"
    });
    assert.equal(loadPendingApprovalRequest(paths), undefined);
    assert.deepEqual(loadStoredApprovalDecisions(paths).map((decision) => decision.decidedAt), [
      "2026-06-11T00:01:00.000Z",
      "2026-06-11T00:03:00.000Z"
    ]);
  }, {
    getApprovalRequest: () => loadPendingApprovalRequest(paths),
    getStoredApprovalDecision: (decision) => findStoredApprovalDecision(decision, paths),
    recordApprovalDecision: (decision) => storeApprovalDecision(
      decision,
      paths,
      new Date("2026-06-11T00:03:00.000Z")
    )
  });
});

test("rejects approval decisions without a matching pending Mac request", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-server-approval-"));
  const paths = getApprovalPaths(home);
  const now = new Date("2026-06-11T00:00:00.000Z");
  storePendingApprovalRequest({
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: now.toISOString()
  }, paths);

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: "other-request",
        action: "approve"
      })
    });

    assert.equal(response.status, 400);
    assert.equal(await response.text(), JSON.stringify({ error: "invalid_approval_decision" }));
    assert.deepEqual(loadStoredApprovalDecisions(paths), []);
    assert.equal(loadPendingApprovalRequest(paths, now)?.id, "fixture-approval");
  }, {
    getApprovalRequest: () => loadPendingApprovalRequest(paths, now),
    recordApprovalDecision: (decision) => storeApprovalDecision(decision, paths, now)
  });
});

test("rejects approval decisions before an injected recorder can bypass pending request validation", async () => {
  const recorded: ApprovalDecisionInput[] = [];

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: "fixture-approval",
        action: "approve"
      })
    });

    assert.equal(response.status, 400);
    assert.equal(await response.text(), JSON.stringify({ error: "invalid_approval_decision" }));
    assert.deepEqual(recorded, []);
  }, {
    getApprovalRequest: () => undefined,
    recordApprovalDecision: (decision): StoredApprovalDecision => {
      recorded.push(decision);
      return {
        ...decision,
        decidedAt: "2026-06-11T00:00:00.000Z"
      };
    }
  });
});

test("rejects approval decisions without auth or with unsafe body fields", async () => {
  await withServer(async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: "fixture-approval",
        action: "approve"
      })
    });
    assert.equal(unauthenticated.status, 401);

    const headers = {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    };
    for (const body of [
      { schemaVersion: 1, requestId: "fixture-approval", action: "maybe" },
      { schemaVersion: 1, requestId: "fixture approval", action: "approve" },
      { schemaVersion: 1, requestId: "fixture-approval", action: "approve", message: "go" },
      { schemaVersion: 1, requestId: "fixture-approval", action: "approve", note: "Bearer secret-token" },
    ]) {
      const response = await fetch(`${baseUrl}/v1/approval-decisions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      assert.equal(response.status, 400);
      assert.equal(await response.text(), JSON.stringify({ error: "invalid_approval_decision" }));
    }
  });
});

test("rejects oversized approval bodies", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: "fixture-approval",
        action: "approve",
        filler: "x".repeat(3_000)
      })
    });

    assert.equal(response.status, 400);
    assert.equal(await response.text(), JSON.stringify({ error: "invalid_approval_decision" }));
  });
});

test("snapshot response stays independent of approval state", async () => {
  const request: ApprovalRequest = {
    schemaVersion: 1,
    id: "fixture-approval",
    source: "Mac 请求",
    title: "允许这一步继续？",
    createdAt: "2026-06-11T00:00:00.000Z",
  };

  await withServer(async (baseUrl) => {
    const headers = {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    };
    const before = await fetch(`${baseUrl}/v1/snapshot`, { headers });
    assert.equal(before.status, 200);
    assert.deepEqual(await before.json(), snapshot);

    const decision = await fetch(`${baseUrl}/v1/approval-decisions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        schemaVersion: 1,
        requestId: "fixture-approval",
        action: "deny"
      })
    });
    assert.equal(decision.status, 200);

    const after = await fetch(`${baseUrl}/v1/snapshot`, { headers });
    assert.equal(after.status, 200);
    assert.deepEqual(await after.json(), snapshot);
  }, {
    recordApprovalDecision: (decision) => ({
      ...decision,
      decidedAt: "2026-06-11T00:00:00.000Z"
    }),
    getApprovalRequest: () => request
  });
});
