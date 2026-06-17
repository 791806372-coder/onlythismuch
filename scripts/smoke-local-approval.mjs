import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-local-approval-"));
const port = await findOpenPort();
const validatorSourcePath = path.join(os.tmpdir(), `aiuw-validate-approval-${process.pid}.swift`);
const validatorPath = path.join(os.tmpdir(), `aiuw-validate-approval-${process.pid}`);

compileSwiftApprovalValidator();

const child = spawn(
  process.execPath,
  [
    "connector/dist/connector/src/cli.js",
    "start",
    "--mock",
    "fixtures/normal.json",
    "--port",
    String(port),
    "--quiet-pairing"
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      AIUW_CONFIG_DIR: configDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
});
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

try {
  await waitFor(() => stdout.includes("aiuw connector listening"), 5_000);

  const pair = spawnSync(
    process.execPath,
    ["connector/dist/connector/src/cli.js", "pair", "--port", String(port), "--manual"],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        AIUW_CONFIG_DIR: configDir
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    }
  );
  if (pair.status !== 0) {
    throw new Error(`aiuw pair --manual failed: ${firstUsefulLine(pair.stderr || pair.stdout)}`);
  }

  const pairingPayload = JSON.parse(extractJSON(pair.stdout));
  const token = pairingPayload.token;
  if (stdout.includes(token) || stderr.includes(token)) {
    throw new Error("Connector start output leaked the pairing token");
  }

  const seed = runApprovalsCommand("seed");
  if (seed.stdout.includes(token) || seed.stderr.includes(token)) {
    throw new Error("approval seed output leaked the pairing token");
  }
  const seeded = JSON.parse(seed.stdout);
  const requestId = seeded.pendingRequest?.id;
  if (seeded.action !== "seed" || typeof requestId !== "string") {
    throw new Error("approval seed did not create a bounded pending request");
  }

  const requestBeforeDecision = await requestJson("/v1/approval-request", token);
  if (requestBeforeDecision.request?.id !== requestId) {
    throw new Error("approval request endpoint did not return the seeded Mac request");
  }
  validateApprovalResponses({
    approvalRequestResponse: requestBeforeDecision
  });

  const decision = await requestJson("/v1/approval-decisions", token, {
    method: "POST",
    body: {
      schemaVersion: 1,
      requestId,
      action: "approve"
    }
  });
  validateApprovalResponses({
    approvalDecisionResponse: decision,
    submittedDecision: {
      requestId,
      action: "approve"
    }
  });

  const requestAfterDecision = await requestJson("/v1/approval-request", token);
  if (requestAfterDecision.request !== null) {
    throw new Error("Mac pending request did not clear after the Mac accepted the decision");
  }
  validateApprovalResponses({
    approvalRequestResponse: requestAfterDecision
  });

  const summary = runApprovalsCommand("status");
  if (summary.stdout.includes(token) || summary.stderr.includes(token)) {
    throw new Error("approval status output leaked the pairing token");
  }
  const status = JSON.parse(summary.stdout);
  if (status.pendingRequest !== null) {
    throw new Error("approval summary still reports a pending request after decision receipt");
  }
  if (!Array.isArray(status.decisions) || status.decisions.at(-1)?.requestId !== requestId) {
    throw new Error("approval summary did not include the accepted decision");
  }

  console.log(`aiuw local approval proof ok: request ${requestId}, port ${port}`);
} finally {
  child.kill("SIGTERM");
  fs.rmSync(configDir, { recursive: true, force: true });
  fs.rmSync(validatorSourcePath, { force: true });
  fs.rmSync(validatorPath, { force: true });
}

function compileSwiftApprovalValidator() {
  fs.mkdirSync(path.join(repoRoot, ".swift-module-cache"), { recursive: true });
  fs.writeFileSync(validatorSourcePath, swiftApprovalValidatorSource(), "utf8");
  const sharedFiles = fs
    .readdirSync(path.join(repoRoot, "ios/Shared"))
    .filter((file) => file.endsWith(".swift"))
    .map((file) => `ios/Shared/${file}`);
  const result = spawnSync(
    "swiftc",
    [
      "-module-cache-path",
      ".swift-module-cache",
      ...sharedFiles,
      validatorSourcePath,
      "-o",
      validatorPath
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    }
  );
  if (result.status !== 0) {
    throw new Error(`Failed to compile Swift approval validator: ${firstUsefulLine(result.stderr || result.stdout)}`);
  }
}

function swiftApprovalValidatorSource() {
  return String.raw`
import Foundation

@main
struct ValidateApprovalResponses {
    static func main() throws {
        let input = FileHandle.standardInput.readDataToEndOfFile()
        guard
            let root = try JSONSerialization.jsonObject(with: input) as? [String: Any]
        else {
            throw ValidationFailure.invalidInput
        }

        let decoder = JSONDecoder.aiUsageSnapshotDecoder
        if let response = root["approvalRequestResponse"] {
            let data = try JSONSerialization.data(withJSONObject: response)
            let decoded = try decoder.decode(ApprovalRequestResponse.self, from: data)
            guard decoded.ok else {
                throw ValidationFailure.invalidResponse
            }
            if let request = decoded.request {
                _ = try request.validated()
            }
        }

        if let response = root["approvalDecisionResponse"] {
            let data = try JSONSerialization.data(withJSONObject: response)
            let decoded = try decoder.decode(ApprovalDecisionResponse.self, from: data)
            guard decoded.ok else {
                throw ValidationFailure.invalidResponse
            }
            guard let submitted = root["submittedDecision"] as? [String: Any],
                  let submittedRequestId = submitted["requestId"] as? String,
                  let submittedAction = submitted["action"] as? String,
                  decoded.requestId == submittedRequestId,
                  decoded.action.rawValue == submittedAction else {
                throw ValidationFailure.invalidResponse
            }
            _ = try ApprovalDecision(
                schemaVersion: decoded.schemaVersion,
                requestId: decoded.requestId,
                action: decoded.action,
                decidedAt: decoded.decidedAt
            ).validated()
        }
    }
}

enum ValidationFailure: Error {
    case invalidInput
    case invalidResponse
}
`;
}

function runApprovalsCommand(action) {
  const args = ["connector/dist/connector/src/cli.js", "approvals"];
  if (action !== "status") {
    args.push(action);
  }

  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      AIUW_CONFIG_DIR: configDir
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`aiuw approvals ${action} failed: ${firstUsefulLine(result.stderr || result.stdout)}`);
  }
  return result;
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Manual pairing output did not contain JSON");
  }
  return text.slice(start, end + 1);
}

async function requestJson(route, token, options = {}) {
  const headers = {
    authorization: `Bearer ${token}`,
    ...(options.body ? { "content-type": "application/json" } : {})
  };
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(3_000)
  });
  if (!response.ok) {
    throw new Error(`${route} returned HTTP ${response.status}`);
  }
  return response.json();
}

function validateApprovalResponses(payload) {
  const validation = spawnSync(validatorPath, [], {
    cwd: repoRoot,
    input: JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (validation.status !== 0) {
    throw new Error(`Swift approval validator rejected connector response: ${firstUsefulLine(validation.stderr || validation.stdout)}`);
  }
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    if (child.exitCode !== null) {
      throw new Error(`Connector exited early: ${firstUsefulLine(stderr || stdout)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for connector start: ${firstUsefulLine(stderr || stdout)}`);
}

function findOpenPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("No open port found"));
        }
      });
    });
    server.on("error", reject);
  });
}

function firstUsefulLine(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "unknown error";
}
