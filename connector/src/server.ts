import http from "node:http";
import type { AddressInfo } from "node:net";
import { parseSnapshot, type Snapshot } from "../../src/contract/schema";
import {
  loadPendingApprovalRequest,
  parseApprovalRequest,
  parseApprovalDecisionInput,
  findStoredApprovalDecision,
  storeApprovalDecision,
  type ApprovalRequest,
  type ApprovalDecisionInput,
  type StoredApprovalDecision,
} from "./approval";
import { publicDeviceName, type ConnectorConfig } from "./config";
import type { JsonValue } from "./snapshot";

export type ServerOptions = {
  config: ConnectorConfig;
  snapshot: Snapshot;
  port: number;
  host?: string;
  getAuthToken?: () => string;
  getSnapshot?: () => Snapshot;
  getApprovalRequest?: () => ApprovalRequest | undefined;
  getStoredApprovalDecision?: (decision: ApprovalDecisionInput) => StoredApprovalDecision | undefined;
  recordApprovalDecision?: (decision: ApprovalDecisionInput) => StoredApprovalDecision;
};

const MAX_JSON_BODY_BYTES = 2_048;

function sendJson(res: http.ServerResponse, status: number, body: JsonValue): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function isAuthorized(req: http.IncomingMessage, token: string): boolean {
  const expected = `Bearer ${token}`;
  return req.headers.authorization === expected;
}

function logRequest(status: number, method: string | undefined, route: string): void {
  console.log(`${new Date().toISOString()} ${status} ${method ?? "UNKNOWN"} ${route}`);
}

export function createConnectorServer(options: ServerOptions): http.Server {
  return http.createServer(async (req, res) => {
    const token = options.getAuthToken?.() ?? options.config.token;
    if (!isAuthorized(req, token)) {
      logRequest(401, req.method, "unauthorized");
      sendJson(res, 401, { error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && req.url === "/v1/ping") {
      logRequest(200, req.method, "/v1/ping");
      sendJson(res, 200, {
        ok: true,
        deviceId: options.config.deviceId,
        name: publicDeviceName(options.config.name)
      });
      return;
    }

    if (req.method === "GET" && req.url === "/v1/snapshot") {
      try {
        const snapshot = parseSnapshot(options.getSnapshot?.() ?? options.snapshot);
        logRequest(200, req.method, "/v1/snapshot");
        sendJson(res, 200, snapshot);
      } catch {
        logRequest(500, req.method, "/v1/snapshot");
        sendJson(res, 500, { error: "snapshot_validation_failed" });
      }
      return;
    }

    if (req.method === "GET" && req.url === "/v1/approval-request") {
      try {
        const request = options.getApprovalRequest?.() ?? loadPendingApprovalRequest();
        const safeRequest = request ? parseApprovalRequest(request) : null;
        logRequest(200, req.method, "/v1/approval-request");
        sendJson(res, 200, {
          ok: true,
          request: safeRequest
        });
      } catch {
        logRequest(500, req.method, "/v1/approval-request");
        sendJson(res, 500, { error: "approval_request_unavailable" });
      }
      return;
    }

    if (req.method === "POST" && req.url === "/v1/approval-decisions") {
      try {
        const input = parseApprovalDecisionInput(await readJsonBody(req));
        const request = options.getApprovalRequest?.() ?? loadPendingApprovalRequest();
        const safeRequest = request ? parseApprovalRequest(request) : null;
        if (safeRequest) {
          if (safeRequest.id !== input.requestId) {
            throw new Error("approval_request_not_pending");
          }
          const decision = options.recordApprovalDecision?.(input) ?? storeApprovalDecision(input);
          logRequest(200, req.method, "/v1/approval-decisions");
          sendJson(res, 200, {
            ok: true,
            schemaVersion: decision.schemaVersion,
            requestId: decision.requestId,
            action: decision.action,
            decidedAt: decision.decidedAt
          });
          return;
        }

        const existingDecision = options.getStoredApprovalDecision?.(input) ??
          (options.recordApprovalDecision ? undefined : findStoredApprovalDecision(input));
        if (!existingDecision) {
          throw new Error("approval_request_not_pending");
        }
        logRequest(200, req.method, "/v1/approval-decisions");
        sendJson(res, 200, {
          ok: true,
          schemaVersion: existingDecision.schemaVersion,
          requestId: existingDecision.requestId,
          action: existingDecision.action,
          decidedAt: existingDecision.decidedAt
        });
      } catch {
        logRequest(400, req.method, "/v1/approval-decisions");
        sendJson(res, 400, { error: "invalid_approval_decision" });
      }
      return;
    }

    logRequest(404, req.method, "not_found");
    sendJson(res, 404, { error: "not_found" });
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new Error("request_body_too_large");
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    throw new Error("missing_request_body");
  }

  return JSON.parse(raw) as unknown;
}

export async function startConnectorServer(options: ServerOptions): Promise<http.Server> {
  const server = createConnectorServer(options);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  console.log(`aiuw connector listening on ${address.address}:${address.port}`);
  return server;
}
