import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiuw-smoke-config-"));
const port = await findOpenPort();

const child = spawn(
  process.execPath,
  [
    "connector/dist/connector/src/cli.js",
    "start",
    "--mock",
    "fixtures/normal.json",
    "--port",
    String(port)
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

  const config = JSON.parse(
    fs.readFileSync(path.join(configDir, "config.json"), "utf8")
  );
  if (stdout.includes(config.token)) {
    throw new Error("Connector default output leaked the pairing token");
  }

  const headers = { authorization: `Bearer ${config.token}` };
  const ping = await requestJson(`http://127.0.0.1:${port}/v1/ping`, headers);
  const snapshot = await requestJson(`http://127.0.0.1:${port}/v1/snapshot`, headers);

  if (ping.ok !== true || ping.deviceId !== config.deviceId) {
    throw new Error("Unexpected ping response");
  }
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.providers)) {
    throw new Error("Unexpected snapshot response");
  }

  const liveStatus = runStatusLive(port);
  if (liveStatus.stdout.includes(config.token)) {
    throw new Error("aiuw status --live leaked the pairing token");
  }
  const livePayload = JSON.parse(liveStatus.stdout);
  if (livePayload.liveCheck?.serverLooksRunning !== true) {
    throw new Error(`aiuw status --live did not find the running connector: ${liveStatus.stdout}`);
  }
  if (livePayload.liveCheck?.snapshotLooksValid !== true) {
    throw new Error(`aiuw status --live did not validate the running connector snapshot: ${liveStatus.stdout}`);
  }

  const pair = spawnSync(
    process.execPath,
    ["connector/dist/connector/src/cli.js", "pair", "--port", String(port)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        AIUW_CONFIG_DIR: configDir
      },
      encoding: "utf8"
    }
  );
  if (pair.status !== 0) {
    throw new Error(`aiuw pair failed: ${pair.stderr || pair.stdout}`);
  }

  const rotatedConfig = JSON.parse(
    fs.readFileSync(path.join(configDir, "config.json"), "utf8")
  );
  if (rotatedConfig.token === config.token) {
    throw new Error("aiuw pair did not rotate token");
  }
  if (pair.stdout.includes(rotatedConfig.token)) {
    throw new Error("aiuw pair default output leaked the rotated token");
  }

  const staleResponse = await fetch(`http://127.0.0.1:${port}/v1/ping`, { headers });
  if (staleResponse.status !== 401) {
    throw new Error(`Old token should fail after rotation, got HTTP ${staleResponse.status}`);
  }

  await requestJson(`http://127.0.0.1:${port}/v1/ping`, {
    authorization: `Bearer ${rotatedConfig.token}`
  });

  const rotatedLiveStatus = runStatusLive(port);
  if (rotatedLiveStatus.stdout.includes(rotatedConfig.token)) {
    throw new Error("aiuw status --live leaked the rotated pairing token");
  }
  const rotatedLivePayload = JSON.parse(rotatedLiveStatus.stdout);
  if (rotatedLivePayload.liveCheck?.serverLooksRunning !== true) {
    throw new Error(`aiuw status --live failed after token rotation: ${rotatedLiveStatus.stdout}`);
  }
  if (rotatedLivePayload.liveCheck?.snapshotLooksValid !== true) {
    throw new Error(`aiuw status --live snapshot check failed after token rotation: ${rotatedLiveStatus.stdout}`);
  }

  console.log(`aiuw smoke ok on 127.0.0.1:${port}`);
} finally {
  child.kill("SIGTERM");
  fs.rmSync(configDir, { recursive: true, force: true });
}

function runStatusLive(targetPort) {
  const status = spawnSync(
    process.execPath,
    ["connector/dist/connector/src/cli.js", "status", "--live", "--port", String(targetPort)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        AIUW_CONFIG_DIR: configDir
      },
      encoding: "utf8"
    }
  );
  if (status.status !== 0) {
    throw new Error(`aiuw status --live failed: ${status.stderr || status.stdout}`);
  }
  return status;
}

async function requestJson(url, headers) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.json();
}

async function waitFor(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    if (child.exitCode !== null) {
      throw new Error(`Connector exited early: ${stderr || stdout}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for connector start: ${stderr || stdout}`);
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
