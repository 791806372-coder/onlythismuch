import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-local-pairing-"));
const port = await findOpenPort();
const validatorPath = path.join(os.tmpdir(), "aiuw-validate-pairing");
const snapshotValidatorPath = path.join(os.tmpdir(), "aiuw-validate-snapshot");

compileSwiftPairingValidator();
compileSwiftSnapshotValidator();

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

  const pairingJSON = extractJSON(pair.stdout);
  const payload = JSON.parse(pairingJSON);
  if (!Array.isArray(payload.hosts) || payload.hosts.length === 0) {
    throw new Error("Pairing payload did not include any local hosts");
  }
  if (stdout.includes(payload.token) || stderr.includes(payload.token)) {
    throw new Error("Connector start output leaked the pairing token");
  }

  const validation = spawnSync(validatorPath, [], {
    cwd: repoRoot,
    input: pairingJSON,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (validation.status !== 0) {
    throw new Error(`Swift pairing validator rejected the payload: ${firstUsefulLine(validation.stderr || validation.stdout)}`);
  }

  const reachableHosts = [];
  const failedHosts = [];
  for (const host of payload.hosts) {
    try {
      await requestPing(host, payload.port, payload.token);
      const snapshotJSON = await requestSnapshot(host, payload.port, payload.token);
      validateSnapshot(snapshotJSON);
      reachableHosts.push(host);
    } catch (error) {
      failedHosts.push({
        host,
        detail: sanitizeProbeError(error)
      });
    }
  }

  if (reachableHosts.length === 0) {
    throw new Error(`No advertised address served ping and a Swift-valid snapshot: ${failedHosts.length} address(es) failed`);
  }

  console.log(`aiuw local pairing proof ok: ${reachableHosts.length} address(es), port ${payload.port}`);
  if (failedHosts.length > 0) {
    console.log(`fallback addresses failed: ${failedHosts.length}`);
  }
} finally {
  child.kill("SIGTERM");
  fs.rmSync(configDir, { recursive: true, force: true });
  fs.rmSync(validatorPath, { force: true });
  fs.rmSync(snapshotValidatorPath, { force: true });
}

function compileSwiftPairingValidator() {
  fs.mkdirSync(path.join(repoRoot, ".swift-module-cache"), { recursive: true });
  const result = spawnSync(
    "swiftc",
    [
      "-module-cache-path",
      ".swift-module-cache",
      "ios/Tools/ValidatePairingPayload.swift",
      "ios/Shared/PrivacySafeText.swift",
      "ios/Shared/PairingPayload.swift",
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
    throw new Error(`Failed to compile Swift pairing validator: ${firstUsefulLine(result.stderr || result.stdout)}`);
  }
}

function compileSwiftSnapshotValidator() {
  fs.mkdirSync(path.join(repoRoot, ".swift-module-cache"), { recursive: true });
  const result = spawnSync(
    "swiftc",
    [
      "-module-cache-path",
      ".swift-module-cache",
      "ios/Shared/PrivacySafeText.swift",
      "ios/Shared/AIUsageSnapshot.swift",
      "ios/Tools/ValidateSnapshot.swift",
      "-o",
      snapshotValidatorPath
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    }
  );
  if (result.status !== 0) {
    throw new Error(`Failed to compile Swift snapshot validator: ${firstUsefulLine(result.stderr || result.stdout)}`);
  }
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Manual pairing output did not contain JSON");
  }
  return text.slice(start, end + 1);
}

async function requestPing(host, targetPort, token) {
  const response = await fetch(`http://${host}:${targetPort}/v1/ping`, {
    headers: {
      authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(3_000)
  });
  if (!response.ok) {
    throw new Error(`address returned HTTP ${response.status}`);
  }

  const body = await response.json();
  if (!body || body.ok !== true) {
    throw new Error("address returned an unexpected ping body");
  }
}

async function requestSnapshot(host, targetPort, token) {
  const response = await fetch(`http://${host}:${targetPort}/v1/snapshot`, {
    headers: {
      authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(3_000)
  });
  if (!response.ok) {
    throw new Error(`address snapshot returned HTTP ${response.status}`);
  }

  return JSON.stringify(await response.json());
}

function validateSnapshot(snapshotJSON) {
  const validation = spawnSync(snapshotValidatorPath, [], {
    cwd: repoRoot,
    input: snapshotJSON,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (validation.status !== 0) {
    throw new Error(`Swift snapshot validator rejected connector snapshot: ${firstUsefulLine(validation.stderr || validation.stdout)}`);
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
    server.listen(0, "0.0.0.0", () => {
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

function sanitizeProbeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return firstUsefulLine(message)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9._~+/=-]{24,}\b/g, "[redacted]")
    .slice(0, 120);
}
